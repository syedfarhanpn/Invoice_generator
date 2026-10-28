"use server"

import prisma from "@/lib/db"
import { assertPermission } from "@/lib/access"
import { normalizeClientCode, suggestClientCode } from "@/lib/client-code"
import { allocateClientNumber } from "@/lib/allocate-ref"
import { sendPortalInvite, type InviteOutcome } from "@/lib/invites"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import { revalidatePath } from "next/cache"

// Note: these actions return { id } instead of calling redirect() themselves.
// They're invoked directly from a client component (src/app/dashboard/clients/client-form.tsx)
// wrapped in try/catch for error display - redirect() throws a special
// NEXT_REDIRECT signal that a surrounding catch would swallow and misreport
// as a failure, so navigation happens client-side via router.push instead.

export type ClientFormInput = {
  fullName: string
  businessName?: string
  email: string
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
  if (!input.email?.trim()) throw new Error("Email is required")

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
        email: input.email.trim(),
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
      email: input.email.trim(),
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
