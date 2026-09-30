"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"

import { assertStageInBoard, ensureBoard } from "@/lib/boards"
import { compactPositions, positionsAfterMove } from "@/lib/ordering"
import { getCurrentUser } from "@/lib/current-user"
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

  for (const { id, position } of ordered) {
    await tx.deal.update({ where: { id }, data: { position } })
  }
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
  value: string | null
  source: string | null
  expectedCloseDate: string | null
  description: string | null
}) {
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

  await prisma.deal.update({
    where: { id: input.dealId },
    data: {
      title,
      clientId,
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
