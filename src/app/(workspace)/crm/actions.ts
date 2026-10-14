"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"

import { assertStageInBoard, ensureBoard } from "@/lib/boards"
import { compactPositions, positionsAfterMove } from "@/lib/ordering"
import { renumber } from "@/lib/renumber"
import { assertPermission } from "@/lib/access"
import { getCurrentUser } from "@/lib/current-user"
import { allocateClientNumber } from "@/lib/allocate-ref"
import { suggestClientCode } from "@/lib/client-code"
import { currentOrgId, resolveAssignee } from "@/lib/members"
import prisma from "@/lib/db"

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
  const user = await getCurrentUser()
  await assertStageInBoard(user.id, "LEADS", toStageId)

  const [deal, stage] = await Promise.all([
    prisma.deal.findFirst({
      where: { id: dealId, userId: user.id, archivedAt: null },
      select: { id: true, title: true, stageId: true },
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

    await renumberColumn(tx, user.id, toStageId, dealId, toIndex)
    if (fromStageId !== toStageId) await renumberColumn(tx, user.id, fromStageId)

    if (fromStageId !== toStageId) {
      await tx.activity.create({
        data: {
          id: randomUUID(),
          userId: user.id,
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

  // Only offer once: an existing project means the prompt was already taken.
  const existingProject = won
    ? await prisma.project.findUnique({ where: { sourceDealId: dealId }, select: { id: true } })
    : null

  return { offerProject: won && !existingProject, title: deal.title }
}

export async function createDeal(stageId: string, title: string) {
  await assertPermission("sales", "write")
  const user = await getCurrentUser()
  const clean = title.trim()
  if (!clean) throw new Error("A lead needs a name.")

  await assertStageInBoard(user.id, "LEADS", stageId)
  const board = await ensureBoard(user.id, "LEADS")
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { currency: true },
  })

  const last = await prisma.deal.findFirst({
    where: { userId: user.id, stageId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  })

  const now = new Date()
  await prisma.deal.create({
    data: {
      // The CRM tables carry no column defaults - see src/lib/boards.ts.
      id: randomUUID(),
      userId: user.id,
      orgId: await currentOrgId(user.id),
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
  const user = await getCurrentUser()
  const title = input.title.trim()
  if (!title) throw new Error("A lead needs a name.")

  const deal = await prisma.deal.findFirst({
    where: { id: input.dealId, userId: user.id, archivedAt: null },
    select: { id: true },
  })
  if (!deal) throw new Error("That lead no longer exists.")

  // A client id is only accepted if it is one of this user's own.
  let clientId: string | null = null
  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, userId: user.id },
      select: { id: true },
    })
    if (!client) throw new Error("That client does not exist.")
    clientId = client.id
  }

  const assignedToId = await resolveAssignee(user.id, input.assignedToId)

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
  const user = await getCurrentUser()

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: user.id, archivedAt: null },
    select: { id: true },
  })
  if (!deal) throw new Error("That lead no longer exists.")

  const existing = await prisma.task.findFirst({
    where: { userId: user.id, dealId, status: "OPEN" },
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
        userId: user.id,
        orgId: await currentOrgId(user.id),
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
  const user = await getCurrentUser()
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: user.id, archivedAt: null },
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
    await renumberColumn(tx, user.id, deal.stageId)
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
  const user = await getCurrentUser()

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: user.id, archivedAt: null },
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
      where: { userId: user.id, code: candidate },
      select: { id: true },
    })
    return taken != null
  })

  const clientId = await prisma.$transaction(async (tx) => {
    const clientNumber = await allocateClientNumber(tx, user.id)
    const client = await tx.client.create({
      data: {
        userId: user.id,
        orgId: await currentOrgId(user.id),
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
        userId: user.id,
        orgId: await currentOrgId(user.id),
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
  const user = await getCurrentUser()
  await assertStageInBoard(user.id, "LEADS", input.stageId)

  if (input.rows.length === 0) return { created: 0, duplicates: 0 }
  // A guard against a mis-picked file, not a product limit: a lead export is
  // hundreds of rows, and anything in the tens of thousands is a mistake
  // worth stopping before it writes.
  if (input.rows.length > 5000) {
    throw new Error("That file has more than 5,000 rows. Split it and import in batches.")
  }

  const board = await ensureBoard(user.id, "LEADS")
  const orgId = await currentOrgId(user.id)
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { currency: true },
  })
  const currency = profile?.currency || "INR"
  const source = input.source?.trim() || null

  // One read for the whole file rather than a query per row.
  const emails = input.rows.map((r) => r.email).filter((e): e is string => e != null)
  const phones = input.rows.map((r) => r.phone).filter((p): p is string => p != null)
  const existing = await prisma.contact.findMany({
    where: {
      userId: user.id,
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

  let position = await nextPosition(user.id, input.stageId)
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
          userId: user.id,
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
          userId: user.id,
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
