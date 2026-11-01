"use server"

import prisma from "@/lib/db"
import { assertPermission, assertWorkspaceAdmin } from "@/lib/access"
import { normalizeClientCode, suggestClientCode } from "@/lib/client-code"
import { confirmationMatches, type ClientImpact } from "@/lib/client-deletion"
import { allocateClientNumber } from "@/lib/allocate-ref"
import { sendPortalInvite, type InviteOutcome } from "@/lib/invites"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import { proposalsReady } from "@/lib/proposals/store"
import { revalidatePath } from "next/cache"

// Note: these actions return { id } instead of calling redirect() themselves.
// They're invoked directly from a client component (src/app/dashboard/clients/client-form.tsx)
// wrapped in try/catch for error display - redirect() throws a special
// NEXT_REDIRECT signal that a surrounding catch would swallow and misreport
// as a failure, so navigation happens client-side via router.push instead.

export type ClientFormInput = {
  fullName: string
  businessName?: string
  // Optional: a proposal can go out on a name and a phone number. Anything
  // that actually emails a client (the portal invite) checks for one itself.
  email?: string
  phone?: string
  address?: string
  country?: string
  taxId?: string
  notes?: string
  tags?: string[]
  defaultCurrency?: string
  code?: string // manual override; auto-suggested if omitted
}

async function codeIsTaken(userId: string, code: string, excludeClientId?: string) {
  const existing = await prisma.client.findFirst({
    where: { userId, code, ...(excludeClientId ? { id: { not: excludeClientId } } : {}) },
    select: { id: true },
  })
  return !!existing
}

export async function suggestCodeForName(name: string): Promise<string> {
  await assertPermission("clients", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  return suggestClientCode(name || "Client", (code) => codeIsTaken(workspaceId, code))
}

export async function createClient(input: ClientFormInput) {
  await assertPermission("clients", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  if (!input.fullName?.trim()) throw new Error("Full name is required")

  const nameForCode = input.businessName?.trim() || input.fullName.trim()
  let code = input.code ? normalizeClientCode(input.code) : ""
  if (!code) {
    code = await suggestClientCode(nameForCode, (c) => codeIsTaken(workspaceId, c))
  } else if (await codeIsTaken(workspaceId, code)) {
    throw new Error(`Client code "${code}" is already in use.`)
  }

  const client = await prisma.$transaction(async (tx) => {
    const clientNumber = await allocateClientNumber(tx, workspaceId)
    return tx.client.create({
      data: {
        userId: workspaceId,
        clientNumber,
        code,
        fullName: input.fullName.trim(),
        businessName: input.businessName?.trim() || null,
        email: input.email?.trim() ?? "",
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        country: input.country?.trim() || null,
        taxId: input.taxId?.trim() || null,
        notes: input.notes?.trim() || null,
        tags: input.tags ?? [],
        defaultCurrency: input.defaultCurrency || null,
      },
    })
  })

  revalidatePath("/dashboard/clients")
  return { id: client.id }
}

export async function updateClient(id: string, input: ClientFormInput) {
  await assertPermission("clients", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const existing = await prisma.client.findUnique({
    where: { id, userId: workspaceId },
    include: { _count: { select: { documents: true } } },
  })
  if (!existing) throw new Error("Client not found")

  const hasDocuments = existing._count.documents > 0
  let code = existing.code

  if (input.code) {
    const normalized = normalizeClientCode(input.code)
    if (normalized !== existing.code) {
      if (hasDocuments) {
        throw new Error(
          "This client's code is locked because they already have a document - editing it would orphan already-issued serial numbers."
        )
      }
      if (await codeIsTaken(workspaceId, normalized, id)) {
        throw new Error(`Client code "${normalized}" is already in use.`)
      }
      code = normalized
    }
  }

  await prisma.client.update({
    where: { id },
    data: {
      code,
      fullName: input.fullName.trim(),
      businessName: input.businessName?.trim() || null,
      email: input.email?.trim() ?? "",
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      country: input.country?.trim() || null,
      taxId: input.taxId?.trim() || null,
      notes: input.notes?.trim() || null,
      tags: input.tags ?? [],
      defaultCurrency: input.defaultCurrency || null,
    },
  })

  revalidatePath("/dashboard/clients")
  revalidatePath(`/dashboard/clients/${id}`)
  return { id }
}

export async function archiveClient(id: string, archived: boolean) {
  await assertPermission("clients", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  await prisma.client.update({
    where: { id, userId: workspaceId },
    data: { archivedAt: archived ? new Date() : null },
  })
  revalidatePath("/dashboard/clients")
  revalidatePath(`/dashboard/clients/${id}`)
}


// ---------------------------------------------------------------------------
// Deleting a client outright.
//
// The bulk path in src/app/dashboard/bulk-actions.ts refuses any client who
// has ever been billed, and keeps doing so: a mis-ticked checkbox must not be
// able to take an invoice ledger with it. This is the deliberate way through,
// and it is shaped to make the act hard to do by accident:
//
//   - owner or admin only, not everyone holding `clients: write`
//   - the counts are read and shown BEFORE anything is removed
//   - the client's own code has to be typed back
//   - one client at a time, never a selection
//
// Everything is deleted explicitly, in dependency order, rather than leaning
// on the ON DELETE rules. Those differ per relation - Document cascades,
// Subscription nulls, CompanyProfile would restrict - so a delete that
// trusted them would quietly do a different thing to each table. Doing it by
// hand means what this function says is what happens.
//
// What deliberately SURVIVES: expenses. Money the business spent is its own
// record, not the client's. Expense.projectId nulls out and
// src/lib/expense-summary.ts already reports such a row as "Project removed",
// so every rupee is still accounted for.
// ---------------------------------------------------------------------------

export type ClientDeletionTarget = {
  id: string
  code: string
  name: string
  impact: ClientImpact
}

/**
 * The counts behind the confirmation dialog.
 *
 * Read through its own action rather than rendered into the page, because
 * the dialog opens long after the page did and a count from twenty minutes
 * ago would under-report what is about to be destroyed.
 */
export async function getClientDeletionImpact(clientId: string): Promise<ClientDeletionTarget> {
  await assertPermission("clients", "read")
  await assertWorkspaceAdmin()
  const { workspaceId } = await getWorkspaceIdentity()

  const client = await prisma.client.findFirst({
    where: { id: clientId, userId: workspaceId },
    select: { id: true, code: true, fullName: true, businessName: true, portalUserId: true },
  })
  if (!client) throw new Error("That client no longer exists.")

  const byClient = { userId: workspaceId, clientId } as const

  const [
    documents,
    issuedDocuments,
    payments,
    projects,
    tasks,
    deals,
    contacts,
    subscriptions,
    tickets,
    activities,
    expenses,
    proposals,
  ] = await Promise.all([
    prisma.document.count({ where: byClient }),
    // "Issued" is defined by the serial, not the status: FINALIZED, SIGNED,
    // VOID and ARCHIVED have all had a number allocated, and it is the
    // number going missing that leaves the gap.
    prisma.document.count({ where: { ...byClient, refNumber: { not: null } } }),
    prisma.payment.count({ where: { userId: workspaceId, document: { clientId } } }),
    prisma.project.count({ where: byClient }),
    // Both kinds: a task filed against the client, and a task on one of
    // their projects that names no client.
    prisma.task.count({
      where: { userId: workspaceId, OR: [{ clientId }, { project: { clientId } }] },
    }),
    prisma.deal.count({ where: byClient }),
    prisma.contact.count({ where: byClient }),
    prisma.subscription.count({ where: byClient }),
    prisma.ticket.count({ where: byClient }),
    prisma.activity.count({ where: byClient }),
    // Counted to be reported as KEPT, not as removed.
    prisma.expense.count({ where: { userId: workspaceId, project: { clientId } } }),
    // The database removes these with the client (ON DELETE CASCADE); counted
    // so the confirmation says so. Zero until the proposals table exists.
    proposalsReady().then((ready) => (ready ? prisma.proposal.count({ where: byClient }) : 0)),
  ])

  return {
    id: client.id,
    code: client.code,
    name: client.businessName || client.fullName,
    impact: {
      documents,
      issuedDocuments,
      payments,
      proposals,
      projects,
      tasks,
      deals,
      contacts,
      subscriptions,
      tickets,
      activities,
      expenses,
      hasPortalAccount: client.portalUserId !== null,
    },
  }
}

export type ClientDeletionResult = {
  name: string
  documents: number
  projects: number
  /** Everything else that went, as one figure for the confirmation message. */
  otherRecords: number
  /** Expenses re-pointed at no project rather than deleted. */
  expensesKept: number
}

/**
 * Deletes a client and everything belonging to them.
 *
 * `confirmation` is the client code, typed by the administrator. Checked here
 * and not only in the dialog: a Server Action is a public endpoint, so the
 * typed confirmation is part of the request to be validated, not a UI step
 * that can be assumed to have happened.
 */
export async function deleteClient(
  clientId: string,
  confirmation: string
): Promise<ClientDeletionResult> {
  // Both gates. The module grant can still be withdrawn from an admin by an
  // override, and an override that says so is honoured.
  await assertPermission("clients", "write")
  await assertWorkspaceAdmin()
  const { workspaceId } = await getWorkspaceIdentity()

  const client = await prisma.client.findFirst({
    where: { id: clientId, userId: workspaceId },
    select: { id: true, code: true, fullName: true, businessName: true },
  })
  if (!client) throw new Error("That client no longer exists.")

  if (!confirmationMatches(confirmation, client.code)) {
    throw new Error(`Type the client code ${client.code} to confirm.`)
  }

  const expensesKept = await prisma.expense.count({
    where: { userId: workspaceId, project: { clientId } },
  })

  const byClient = { userId: workspaceId, clientId } as const
  // Asked outside the transaction: on a database without the proposals
  // table, a query against it would abort the whole delete.
  const hasProposalsTable = await proposalsReady()

  const removed = await prisma.$transaction(
    async (tx) => {
      // Children before parents throughout, so no statement depends on a
      // cascade having fired. Payments and document activity are reachable
      // only through their document, so they are scoped through the relation.
      await tx.payment.deleteMany({ where: { userId: workspaceId, document: { clientId } } })
      await tx.documentActivity.deleteMany({
        where: { document: { clientId, userId: workspaceId } },
      })
      const documents = await tx.document.deleteMany({ where: byClient })
      const proposals = hasProposalsTable ? await tx.proposal.deleteMany({ where: byClient }) : { count: 0 }

      await tx.ticketReply.deleteMany({ where: { ticket: { clientId, userId: workspaceId } } })
      const tickets = await tx.ticket.deleteMany({ where: byClient })

      const subscriptions = await tx.subscription.deleteMany({ where: byClient })

      // Before the projects, so this is a delete rather than a cascade - the
      // same rows either way, but counted and not inferred.
      const tasks = await tx.task.deleteMany({
        where: { userId: workspaceId, OR: [{ clientId }, { project: { clientId } }] },
      })
      const activities = await tx.activity.deleteMany({ where: byClient })
      await tx.companyProfile.deleteMany({ where: byClient })

      // Nulls Expense.projectId on the way out. That is the one referential
      // action relied on, and it is relied on to KEEP a row, not remove one.
      const projects = await tx.project.deleteMany({ where: byClient })

      // Deals before contacts: Deal.primaryContactId points at a Contact.
      const deals = await tx.deal.deleteMany({ where: byClient })
      const contacts = await tx.contact.deleteMany({ where: byClient })

      // deleteMany, not delete: the tenant boundary belongs in the WHERE
      // clause, and a row already gone should report plainly rather than
      // throwing a record-not-found from the middle of a transaction.
      const self = await tx.client.deleteMany({ where: { id: clientId, userId: workspaceId } })
      if (self.count !== 1) throw new Error("That client no longer exists.")

      return {
        documents: documents.count,
        projects: projects.count,
        otherRecords:
          proposals.count +
          tickets.count +
          subscriptions.count +
          tasks.count +
          activities.count +
          deals.count +
          contacts.count,
      }
    },
    // Thirteen statements against a long-standing client with hundreds of
    // tasks and documents. The default five seconds is the limit that broke
    // the board renumber; it is not worth meeting again here.
    { timeout: 30_000 }
  )

  // A client reaches into clients, documents, projects, tasks, renewals,
  // tickets, the calendar, the dashboard and every report, so the cheap
  // targeted revalidations would each leave one page showing a client that
  // no longer exists.
  revalidatePath("/", "layout")

  return {
    name: client.businessName || client.fullName,
    ...removed,
    expensesKept,
  }
}

/**
 * Invites a client to their portal, or sends the invitation again.
 *
 * One action for both, because they do the same thing: generate a fresh
 * sign-in link and email it. Re-inviting does not disturb an account that
 * has already been claimed - the link just lets them set a new password.
 */
export async function invitePortalClient(
  clientId: string,
  note?: string | null
): Promise<InviteOutcome> {
  await assertPermission("clients", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const client = await prisma.client.findFirst({
    where: { id: clientId, userId: workspaceId, archivedAt: null },
    select: { id: true, email: true, fullName: true, businessName: true },
  })
  if (!client) throw new Error("That client no longer exists.")
  if (!client.email?.trim()) {
    throw new Error("This client has no email address. Add one before inviting them.")
  }

  const identity = await getWorkspaceIdentity()

  const outcome = await sendPortalInvite({
    email: client.email.trim(),
    clientName: client.businessName || client.fullName,
    note: note?.trim() || null,
    brandName: identity.brandName,
    inviterName: identity.displayName,
    replyTo: identity.email,
  })

  // Recorded even when the email failed: the invitation exists, the link in
  // the result still works, and portal-auth.ts needs this set before it will
  // let a sign-in claim the client row.
  await prisma.client.update({
    where: { id: clientId },
    data: { portalInvitedAt: new Date() },
  })

  revalidatePath(`/dashboard/clients/${clientId}`)
  return outcome
}

/**
 * Takes portal access away.
 *
 * Clears both the invitation and the claimed account, so an outstanding
 * link can no longer be used to claim the row and an account that already
 * signed in stops resolving to this client. The Supabase auth user is left
 * alone - deleting someone's login because a business relationship ended is
 * not ours to do, and it may be attached to something else.
 */
export async function revokePortalAccess(clientId: string) {
  await assertPermission("clients", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const client = await prisma.client.findFirst({
    where: { id: clientId, userId: workspaceId },
    select: { id: true },
  })
  if (!client) throw new Error("That client no longer exists.")

  await prisma.client.update({
    where: { id: clientId },
    data: { portalUserId: null, portalInvitedAt: null, portalEnabledAt: null },
  })

  revalidatePath(`/dashboard/clients/${clientId}`)
}
