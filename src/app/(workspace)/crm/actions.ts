"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { assertStageInBoard, ensureBoard } from "@/lib/boards"
import { compactPositions, positionsAfterMove } from "@/lib/ordering"
import { renumber } from "@/lib/renumber"
import { z } from "zod"

import type { BulkResult } from "@/app/dashboard/bulk-actions"
import { assertPermission, assertWorkspaceAdmin } from "@/lib/access"
import { canDeleteDeal } from "@/lib/bulk-actions"
import { allocateClientNumber } from "@/lib/allocate-ref"
import { suggestClientCode } from "@/lib/client-code"
import { currentOrgId, resolveAssignee } from "@/lib/members"
import prisma from "@/lib/db"
import { LEAD_EVENT_SOURCE, sendLeadStageEvents } from "@/lib/meta/capi-client"
import { isMetaLead } from "@/lib/meta/capi-event"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

/**
 * Writes for the Leads board.
 *
 * A stage move is also a fact worth keeping, so each one appends to the
 * activity trail - a deal's history is meant to read in one query, and a card
 * that silently changed column would leave a hole in it.
 */

async function renumberColumn(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  stageId: string,
  movedId?: string,
  toIndex?: number
) {
  const rows = await tx.deal.findMany({
    where: { userId, stageId, archivedAt: null },
    orderBy: { position: "asc" },
    select: { id: true },
  })

  const ordered =
    movedId != null && toIndex != null
      ? positionsAfterMove(rows, movedId, toIndex)
      : compactPositions(rows)

  // One statement, not one per card. See the note in lib/renumber.ts: the
  // loop this replaces timed the transaction out once a column held a few
  // hundred leads, and refused moves that were perfectly legal.
  await renumber(tx, "deal", userId, ordered)
}

export type MoveDealResult = {
  /** True when this move closed the deal as won and no project exists yet. */
  offerProject: boolean
  title: string
}

export async function moveDeal(
  dealId: string,
  toStageId: string,
  toIndex: number
): Promise<MoveDealResult> {
  await assertPermission("sales", "write")
  const { workspaceId, orgId } = await getWorkspaceIdentity()
  await assertStageInBoard(workspaceId, "LEADS", toStageId)

  const [deal, stage] = await Promise.all([
    prisma.deal.findFirst({
      where: { id: dealId, userId: workspaceId, archivedAt: null },
      select: {
        id: true,
        title: true,
        stageId: true,
        // For the Conversions API report below, read in the same query so a
        // workspace without Meta connected pays nothing extra for it.
        source: true,
        createdAt: true,
        value: true,
        currency: true,
        primaryContact: { select: { email: true, phone: true, firstName: true, lastName: true } },
        client: { select: { email: true, phone: true, country: true } },
      },
    }),
    prisma.stage.findUnique({
      where: { id: toStageId },
      select: { type: true, name: true, probability: true },
    }),
  ])
  if (!deal) throw new Error("That lead no longer exists.")

  const fromStageId = deal.stageId
  const won = stage?.type === "WON"
  const lost = stage?.type === "LOST"
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      data: {
        stageId: toStageId,
        probability: stage?.probability ?? undefined,
        outcome: won ? "WON" : lost ? "LOST" : null,
        // Cleared on the way back out, so a reopened deal is not still
        // claiming a close date.
        closedAt: won || lost ? now : null,
        updatedAt: now,
      },
    })

    await renumberColumn(tx, workspaceId, toStageId, dealId, toIndex)
    if (fromStageId !== toStageId) await renumberColumn(tx, workspaceId, fromStageId)

    if (fromStageId !== toStageId) {
      await tx.activity.create({
        data: {
          id: randomUUID(),
          userId: workspaceId,
          type: won ? "DEAL_WON" : lost ? "DEAL_LOST" : "STAGE_CHANGE",
          subject: `Moved to ${stage?.name ?? "another stage"}`,
          dealId,
          occurredAt: now,
          createdAt: now,
        },
      })
    }
  })

  revalidatePath("/crm")
  revalidatePath("/dashboard")

  // Tell Meta the lead moved, so it can learn which of its leads go anywhere.
  //
  // Scheduled here, after the transaction, and never before it: after() runs
  // even when the response fails, so registering it earlier would report a
  // move that rolled back. And in after() rather than awaited, so a slow or
  // unreachable Graph API can never hold up a drag - the board answers first,
  // Meta hears about it a moment later, and the outcome lands in SyncLog.
  //
  // Only leads Meta produced, only real column changes, and never into Lost:
  // Meta's lead stages are a funnel of steps forward, and an event named after
  // a stage nobody registered there is flagged rather than learned from.
  if (fromStageId !== toStageId && stage && !lost && isMetaLead(deal.source)) {
    const contact = deal.primaryContact
    after(() =>
      sendLeadStageEvents(workspaceId, orgId, [
        {
          dealId: deal.id,
          stageName: stage.name,
          occurredAt: now,
          leadCreatedAt: deal.createdAt,
          identity: {
            email: contact?.email || deal.client?.email,
            phone: contact?.phone || deal.client?.phone,
            firstName: contact?.firstName,
            lastName: contact?.lastName,
            country: deal.client?.country,
          },
          leadEventSource: LEAD_EVENT_SOURCE,
          // Value only once it is won - an open lead's value is a hope.
          value: won && deal.value != null ? Number(deal.value) : null,
          currency: deal.currency,
        },
      ])
    )
  }

  // Only offer once: an existing project means the prompt was already taken.
  const existingProject = won
    ? await prisma.project.findUnique({ where: { sourceDealId: dealId }, select: { id: true } })
    : null

  return { offerProject: won && !existingProject, title: deal.title }
}

export async function createDeal(stageId: string, title: string) {
  await assertPermission("sales", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const clean = title.trim()
  if (!clean) throw new Error("A lead needs a name.")

  await assertStageInBoard(workspaceId, "LEADS", stageId)
  const board = await ensureBoard(workspaceId, "LEADS")
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: workspaceId },
    select: { currency: true },
  })

  const last = await prisma.deal.findFirst({
    where: { userId: workspaceId, stageId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  })

  const now = new Date()
  await prisma.deal.create({
    data: {
      // The CRM tables carry no column defaults - see src/lib/boards.ts.
      id: randomUUID(),
      userId: workspaceId,
      orgId: await currentOrgId(workspaceId),
      pipelineId: board.id,
      stageId,
      title: clean,
      currency: profile?.currency || "INR",
      position: (last?.position ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    },
  })

  revalidatePath("/crm")
  revalidatePath("/dashboard")
}

/**
 * Edits a lead's own fields.
 *
 * The stage is not among them: moving a deal is a board action that also
 * renumbers a column and writes an activity, so it stays in moveDeal() rather
 * than being reachable two ways that could drift apart.
 */
export async function updateDeal(input: {
  dealId: string
  title: string
  clientId: string | null
  assignedToId: string | null
  value: string | null
  source: string | null
  expectedCloseDate: string | null
  description: string | null
}) {
  await assertPermission("sales", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const title = input.title.trim()
  if (!title) throw new Error("A lead needs a name.")

  const deal = await prisma.deal.findFirst({
    where: { id: input.dealId, userId: workspaceId, archivedAt: null },
    select: { id: true },
  })
  if (!deal) throw new Error("That lead no longer exists.")

  // A client id is only accepted if it is one of this user's own.
  let clientId: string | null = null
  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, userId: workspaceId },
      select: { id: true },
    })
    if (!client) throw new Error("That client does not exist.")
    clientId = client.id
  }

  const assignedToId = await resolveAssignee(workspaceId, input.assignedToId)

  await prisma.deal.update({
    where: { id: input.dealId },
    data: {
      title,
      clientId,
      assignedToId,
      value: parseAmount(input.value),
      source: input.source?.trim() || null,
      expectedCloseDate: parseDay(input.expectedCloseDate),
      description: input.description?.trim() || null,
      updatedAt: new Date(),
    },
  })

  revalidatePath("/crm")
  revalidatePath("/dashboard")
}

/**
 * Sets the one thing you will do next about this lead.
 *
 * Updates the existing next open task rather than stacking another beside it:
 * the board, the inbox and the agenda all read "the next open task", and two
 * of them would make that phrase meaningless. Clearing the title closes it.
 */
export async function setNextAction(dealId: string, title: string, dueAt: string | null) {
  await assertPermission("sales", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: workspaceId, archivedAt: null },
    select: { id: true },
  })
  if (!deal) throw new Error("That lead no longer exists.")

  const existing = await prisma.task.findFirst({
    where: { userId: workspaceId, dealId, status: "OPEN" },
    orderBy: { dueAt: "asc" },
    select: { id: true },
  })

  const clean = title.trim()
  const now = new Date()
  const due = parseDay(dueAt)

  if (!clean) {
    // No title means there is no next action; the open one is cancelled
    // rather than left behind as a task nobody will do.
    if (existing) {
      await prisma.task.update({
        where: { id: existing.id },
        data: { status: "CANCELLED", updatedAt: now },
      })
    }
  } else if (existing) {
    await prisma.task.update({
      where: { id: existing.id },
      // Rescheduling clears the stamp so the reminder fires again.
      data: { title: clean, dueAt: due, remindAt: due, notifiedAt: null, updatedAt: now },
    })
  } else {
    await prisma.task.create({
      data: {
        id: randomUUID(),
        userId: workspaceId,
        orgId: await currentOrgId(workspaceId),
        dealId,
        title: clean,
        status: "OPEN",
        priority: "NORMAL",
        dueAt: due,
        remindAt: due,
        createdAt: now,
        updatedAt: now,
      },
    })
  }

  revalidatePath("/crm")
  revalidatePath("/calendar")
  revalidatePath("/dashboard")
}

export async function archiveDeal(dealId: string) {
  await assertPermission("sales", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: workspaceId, archivedAt: null },
    select: { id: true, stageId: true },
  })
  if (!deal) throw new Error("That lead no longer exists.")

  // Archived, not deleted: a lead that went nowhere is still evidence of what
  // you tried, and its activity trail hangs off this row.
  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      data: { archivedAt: new Date(), updatedAt: new Date() },
    })
    await renumberColumn(tx, workspaceId, deal.stageId)
  })

  revalidatePath("/crm")
  revalidatePath("/dashboard")
}

/**
 * Turns a lead into a client.
 *
 * The lead keeps its row and its activity trail - converting is not winning,
 * and a deal that silently vanished into a client record would take its own
 * history with it. Instead the two are linked: the deal's clientId points at
 * the new client, so the lead reads as "this became them".
 *
 * Idempotent by that link. A lead already pointing at a client returns that
 * client rather than making a second one, which is what stops a double click
 * from producing twins.
 *
 * Needs write on BOTH modules, because it reads a lead and creates a client.
 * Someone who may work the pipeline but not touch the client book should not
 * get a side door into it.
 */
export async function convertDealToClient(dealId: string): Promise<{ clientId: string }> {
  await assertPermission("sales", "write")
  await assertPermission("clients", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: workspaceId, archivedAt: null },
    select: {
      id: true,
      title: true,
      clientId: true,
      description: true,
      source: true,
      primaryContact: {
        select: { firstName: true, lastName: true, email: true, phone: true },
      },
    },
  })
  if (!deal) throw new Error("That lead no longer exists.")
  if (deal.clientId) return { clientId: deal.clientId }

  const contact = deal.primaryContact
  const fullName =
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ").trim() || deal.title
  const email = contact?.email?.trim() || ""

  // A client must have an email - it is what every document is sent to. A
  // lead captured without one has to be completed before it can become a
  // client, and saying so is better than inventing a placeholder address
  // that would silently fail the first time anyone invoiced them.
  if (!email) {
    throw new Error(
      "This lead has no email address. Open it, add one to the contact, then convert."
    )
  }

  const code = await suggestClientCode(fullName, async (candidate) => {
    const taken = await prisma.client.findFirst({
      where: { userId: workspaceId, code: candidate },
      select: { id: true },
    })
    return taken != null
  })

  const clientId = await prisma.$transaction(async (tx) => {
    const clientNumber = await allocateClientNumber(tx, workspaceId)
    const client = await tx.client.create({
      data: {
        userId: workspaceId,
        orgId: await currentOrgId(workspaceId),
        clientNumber,
        code,
        fullName,
        email,
        phone: contact?.phone?.trim() || null,
        // Everything the lead carried that a client has no column for. The
        // description is where an imported form's extra answers live, so this
        // is what keeps them attached after conversion.
        notes: [deal.description?.trim(), deal.source ? `Source: ${deal.source}` : null]
          .filter(Boolean)
          .join("\n\n") || null,
        tags: [],
      },
      select: { id: true },
    })

    await tx.deal.update({
      where: { id: dealId },
      data: { clientId: client.id, updatedAt: new Date() },
    })

    await tx.activity.create({
      data: {
        id: randomUUID(),
        userId: workspaceId,
        orgId: await currentOrgId(workspaceId),
        dealId,
        clientId: client.id,
        type: "NOTE",
        subject: "Converted to client",
        occurredAt: new Date(),
        createdAt: new Date(),
      },
    })

    return client.id
  })

  revalidatePath("/crm")
  revalidatePath("/dashboard/clients")
  return { clientId }
}

/**
 * Imports leads from an exported CSV - a Meta lead-ad download, or anything
 * else with a header row.
 *
 * Name, email and phone are matched by meaning; every other column is kept
 * verbatim in the description, because the questions change from ad to ad and
 * a schema for this week's form would not read next week's. The parsing rules
 * live in lib/lead-import.ts, pure and tested.
 *
 * Duplicates are skipped rather than merged. An import run twice should not
 * double the pipeline, and "already here" is a better outcome than silently
 * overwriting a lead someone has since worked on. Matched on email or phone,
 * since the same person rarely arrives twice with both changed.
 */
export async function importLeads(input: {
  stageId: string
  source: string | null
  rows: {
    name: string
    email: string | null
    phone: string | null
    description: string
    /** ISO, when the file carried a date. Null uses the time of import. */
    createdAt: string | null
  }[]
}): Promise<{ created: number; duplicates: number }> {
  await assertPermission("sales", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  await assertStageInBoard(workspaceId, "LEADS", input.stageId)

  if (input.rows.length === 0) return { created: 0, duplicates: 0 }
  // A guard against a mis-picked file, not a product limit: a lead export is
  // hundreds of rows, and anything in the tens of thousands is a mistake
  // worth stopping before it writes.
  if (input.rows.length > 5000) {
    throw new Error("That file has more than 5,000 rows. Split it and import in batches.")
  }

  const board = await ensureBoard(workspaceId, "LEADS")
  const orgId = await currentOrgId(workspaceId)
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: workspaceId },
    select: { currency: true },
  })
  const currency = profile?.currency || "INR"
  const source = input.source?.trim() || null

  // One read for the whole file rather than a query per row.
  const emails = input.rows.map((r) => r.email).filter((e): e is string => e != null)
  const phones = input.rows.map((r) => r.phone).filter((p): p is string => p != null)
  const existing = await prisma.contact.findMany({
    where: {
      userId: workspaceId,
      archivedAt: null,
      OR: [
        ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
        ...(phones.length > 0 ? [{ phone: { in: phones } }] : []),
      ],
    },
    select: { email: true, phone: true },
  })
  const seenEmails = new Set(existing.map((c) => c.email?.toLowerCase()).filter(Boolean))
  const seenPhones = new Set(existing.map((c) => c.phone).filter(Boolean))

  let position = await nextPosition(workspaceId, input.stageId)
  let created = 0
  let duplicates = 0

  for (const row of input.rows) {
    const emailKey = row.email?.toLowerCase()
    if ((emailKey && seenEmails.has(emailKey)) || (row.phone && seenPhones.has(row.phone))) {
      duplicates += 1
      continue
    }
    // Added as we go, so a file containing the same person twice imports once.
    if (emailKey) seenEmails.add(emailKey)
    if (row.phone) seenPhones.add(row.phone)

    const now = new Date()
    // When the lead actually arrived, when the file said so. A date from the
    // future is a misread column rather than a fact, so it is ignored.
    const arrived = parseImportedDate(row.createdAt, now)
    const [firstName, ...rest] = row.name.trim().split(/\s+/)

    await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          id: randomUUID(),
          userId: workspaceId,
          orgId,
          firstName: firstName || row.name.trim(),
          lastName: rest.join(" ") || null,
          email: row.email,
          phone: row.phone,
          isPrimary: true,
          createdAt: arrived,
          updatedAt: now,
        },
        select: { id: true },
      })

      await tx.deal.create({
        data: {
          id: randomUUID(),
          userId: workspaceId,
          orgId,
          pipelineId: board.id,
          stageId: input.stageId,
          title: row.name.trim(),
          description: row.description || null,
          primaryContactId: contact.id,
          source,
          currency,
          position: position++,
          // The date from the file, so "Leads this month" and the trend
          // chart describe when leads arrived rather than when you imported
          // them - which would otherwise pile a year of ads into today.
          createdAt: arrived,
          updatedAt: now,
        },
      })
    })

    created += 1
  }

  revalidatePath("/crm")
  revalidatePath("/dashboard")
  return { created, duplicates }
}

/**
 * A date the browser parsed out of the file, re-checked here.
 *
 * Server actions are a public endpoint: the client already validated this,
 * which means nothing. A date that is unparseable, before 2000 or in the
 * future is a misread column rather than a fact, and the time of import is
 * the honest fallback.
 */
function parseImportedDate(value: string | null, now: Date): Date {
  if (!value) return now
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return now
  if (parsed.getTime() > now.getTime()) return now
  if (parsed.getUTCFullYear() < 2000) return now
  return parsed
}

/** Where the next card goes: the end of the column. */
async function nextPosition(userId: string, stageId: string): Promise<number> {
  const last = await prisma.deal.findFirst({
    where: { userId, stageId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  return (last?.position ?? -1) + 1
}

/** A money field as typed, or null. Rejects nothing - the column is nullable
 *  and a half-typed amount should not block saving the rest of the form. */
function parseAmount(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

/** A date input's "YYYY-MM-DD", read as a calendar day in the operator's zone. */
function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(`${value.trim()}T09:00:00+05:30`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

// ---------------------------------------------------------------------------
// Bulk clean-up from the Inbox list.
//
// Both re-read every selected row rather than trusting the ids: a Server
// Action is a public endpoint, and the checkbox state is a hint, never a
// permission. Larger than the other bulk limits because junk arrives in
// volume - a bad ad set can produce a few hundred leads in a weekend.
// ---------------------------------------------------------------------------

const dealIdsSchema = z.array(z.string().min(1).max(64)).min(1).max(500)

function parseDealIds(ids: string[]): string[] {
  const parsed = dealIdsSchema.safeParse(ids)
  if (parsed.success) return [...new Set(parsed.data)]
  throw new Error(
    ids.length > 500 ? "Select at most 500 leads at a time." : "Nothing valid was selected."
  )
}

/**
 * Deletes selected leads for good. Owners and admins only.
 *
 * Won leads are skipped - see canDeleteDeal(). Everything else goes with the
 * lead, deleted explicitly in one transaction rather than left to the
 * database's ON DELETE rules, so what this says is what happens:
 *
 *   - its activity history and follow-up tasks
 *   - its contact, when that contact exists only for this lead: not attached
 *     to a client, and not the contact on any lead that survives. A junk
 *     lead's name, phone and email are the junk; leaving them behind
 *     invisibly would keep the personal data while removing the only screen
 *     that showed it.
 *
 * A project started from one of these leads survives, with its link to the
 * lead cleared.
 */
export async function bulkDeleteDeals(ids: string[]): Promise<BulkResult> {
  await assertPermission("sales", "write")
  await assertWorkspaceAdmin()
  const { workspaceId } = await getWorkspaceIdentity()
  const requested = parseDealIds(ids)

  const rows = await prisma.deal.findMany({
    where: { id: { in: requested }, userId: workspaceId },
    select: {
      id: true,
      stageId: true,
      primaryContactId: true,
      stage: { select: { type: true } },
    },
  })

  const deletable = rows.filter((r) => canDeleteDeal(r.stage.type === "WON"))
  if (deletable.length === 0) return { changed: 0, skipped: requested.length }

  const dealIds = deletable.map((r) => r.id)
  const contactIds = [
    ...new Set(deletable.map((r) => r.primaryContactId).filter((id): id is string => !!id)),
  ]
  const stageIds = [...new Set(deletable.map((r) => r.stageId))]

  const changed = await prisma.$transaction(
    async (tx) => {
      await tx.activity.deleteMany({ where: { userId: workspaceId, dealId: { in: dealIds } } })
      await tx.task.deleteMany({ where: { userId: workspaceId, dealId: { in: dealIds } } })
      await tx.project.updateMany({
        where: { userId: workspaceId, sourceDealId: { in: dealIds } },
        data: { sourceDealId: null },
      })

      // The stage type is asserted again in the DELETE itself, so a lead
      // dragged into Won between the read above and this line is left alone.
      const { count } = await tx.deal.deleteMany({
        where: { id: { in: dealIds }, userId: workspaceId, stage: { type: { not: "WON" } } },
      })

      if (contactIds.length > 0) {
        // Checked after the deals are gone, so "no surviving lead uses it"
        // reads the real state rather than the state before the delete.
        await tx.contact.deleteMany({
          where: {
            id: { in: contactIds },
            userId: workspaceId,
            clientId: null,
            deals: { none: {} },
            tickets: { none: {} },
          },
        })
      }

      // Close the gaps in every column a deleted card sat in.
      for (const stageId of stageIds) await renumberColumn(tx, workspaceId, stageId)

      return count
    },
    // Hundreds of rows across several tables; see the note in lib/renumber.ts
    // on what the default five seconds did to the board.
    { timeout: 30_000 }
  )

  revalidatePath("/crm")
  revalidatePath("/dashboard")
  revalidatePath("/tasks")
  revalidatePath("/calendar")
  return { changed, skipped: requested.length - changed }
}

/**
 * Archives selected leads: out of every list and board, nothing destroyed.
 * Open to anyone who may work the leads, unlike deleting.
 */
export async function bulkArchiveDeals(ids: string[]): Promise<BulkResult> {
  await assertPermission("sales", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const requested = parseDealIds(ids)

  const rows = await prisma.deal.findMany({
    where: { id: { in: requested }, userId: workspaceId, archivedAt: null },
    select: { id: true, stageId: true },
  })
  if (rows.length === 0) return { changed: 0, skipped: requested.length }

  const changed = await prisma.$transaction(
    async (tx) => {
      const now = new Date()
      const { count } = await tx.deal.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, userId: workspaceId, archivedAt: null },
        data: { archivedAt: now, updatedAt: now },
      })
      for (const stageId of new Set(rows.map((r) => r.stageId))) {
        await renumberColumn(tx, workspaceId, stageId)
      }
      return count
    },
    { timeout: 30_000 }
  )

  revalidatePath("/crm")
  revalidatePath("/dashboard")
  return { changed, skipped: requested.length - changed }
}
