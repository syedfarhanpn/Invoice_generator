"use server"

import { revalidatePath } from "next/cache"

import { assertStageInBoard, ensureBoard } from "@/lib/boards"
import { compactPositions, positionsAfterMove } from "@/lib/ordering"
import { getCurrentUser } from "@/lib/current-user"
import prisma from "@/lib/db"

/**
 * Writes for the Projects board.
 *
 * Positions are rewritten a column at a time rather than kept as sparse or
 * fractional values: a column holds tens of cards, so one renumber per move is
 * cheap and leaves `position` an integer that means what it says. Every write
 * re-derives the user from the session and scopes by userId, so a card id
 * guessed from somebody else's board finds nothing.
 */

/** Rewrites one column's positions to 0..n-1 in the order given. */
async function renumberColumn(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  stageId: string,
  movedId?: string,
  toIndex?: number
) {
  const rows = await tx.project.findMany({
    where: { userId, stageId, archivedAt: null },
    orderBy: { position: "asc" },
    select: { id: true },
  })

  const ordered =
    movedId != null && toIndex != null
      ? positionsAfterMove(rows, movedId, toIndex)
      : compactPositions(rows)

  // Sequential, not Promise.all: an interactive transaction is one connection
  // and parallel writes on it are not worth the risk for tens of rows.
  for (const { id, position } of ordered) {
    await tx.project.update({ where: { id }, data: { position } })
  }
}

export async function moveProject(projectId: string, toStageId: string, toIndex: number) {
  const user = await getCurrentUser()
  await assertStageInBoard(user.id, "PROJECTS", toStageId)

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id, archivedAt: null },
    select: { id: true, stageId: true },
  })
  if (!project) throw new Error("That project no longer exists.")

  const fromStageId = project.stageId

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { stageId: toStageId } })
    await renumberColumn(tx, user.id, toStageId, projectId, toIndex)
    // Closing the gap the card left behind.
    if (fromStageId !== toStageId) await renumberColumn(tx, user.id, fromStageId)
  })

  revalidatePath("/projects")
}

export async function createProject(stageId: string, title: string) {
  const user = await getCurrentUser()
  const clean = title.trim()
  if (!clean) throw new Error("A project needs a title.")

  await assertStageInBoard(user.id, "PROJECTS", stageId)
  const board = await ensureBoard(user.id, "PROJECTS")
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { currency: true },
  })

  // Appended to the end of the column, which is where a new card belongs -
  // you have not decided its priority yet.
  const last = await prisma.project.findFirst({
    where: { userId: user.id, stageId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  })

  await prisma.project.create({
    data: {
      userId: user.id,
      pipelineId: board.id,
      stageId,
      title: clean,
      currency: profile?.currency || "INR",
      position: (last?.position ?? -1) + 1,
    },
  })

  revalidatePath("/projects")
}

/**
 * Starts a project from a won deal.
 *
 * Offered rather than automatic: not every won deal is a project, and a
 * one-off invoice that silently became a delivery card would be noise. The
 * unique constraint on sourceDealId is what makes accepting twice a no-op
 * instead of a duplicate.
 */
export async function startProjectFromDeal(dealId: string) {
  const user = await getCurrentUser()

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, userId: user.id },
    select: { id: true, title: true, clientId: true, value: true, currency: true },
  })
  if (!deal) throw new Error("That deal no longer exists.")

  const existing = await prisma.project.findUnique({
    where: { sourceDealId: dealId },
    select: { id: true },
  })
  if (existing) return { created: false, projectId: existing.id }

  const board = await ensureBoard(user.id, "PROJECTS")
  const first = board.stages.find((stage) => stage.type === "OPEN") ?? board.stages[0]
  if (!first) throw new Error("The Projects board has no columns yet. Add some in Preferences.")

  const last = await prisma.project.findFirst({
    where: { userId: user.id, stageId: first.id, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  })

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      pipelineId: board.id,
      stageId: first.id,
      clientId: deal.clientId,
      sourceDealId: deal.id,
      title: deal.title,
      value: deal.value,
      currency: deal.currency,
      startedAt: new Date(),
      position: (last?.position ?? -1) + 1,
    },
  })

  revalidatePath("/projects")
  revalidatePath("/crm")
  return { created: true, projectId: project.id }
}

/**
 * Edits a project's own fields.
 *
 * Its stage stays with moveProject() for the same reason a deal's does: the
 * move renumbers a column, and a second path that skipped that would leave
 * positions inconsistent with what the board shows.
 */
export async function updateProject(input: {
  projectId: string
  title: string
  clientId: string | null
  value: string | null
  deadline: string | null
  description: string | null
}) {
  const user = await getCurrentUser()
  const title = input.title.trim()
  if (!title) throw new Error("A project needs a title.")

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: user.id, archivedAt: null },
    select: { id: true },
  })
  if (!project) throw new Error("That project no longer exists.")

  let clientId: string | null = null
  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, userId: user.id },
      select: { id: true },
    })
    if (!client) throw new Error("That client does not exist.")
    clientId = client.id
  }

  await prisma.project.update({
    where: { id: input.projectId },
    data: {
      title,
      clientId,
      value: parseAmount(input.value),
      deadline: parseDay(input.deadline),
      description: input.description?.trim() || null,
    },
  })

  revalidatePath("/projects")
  revalidatePath("/calendar")
}

export async function archiveProject(projectId: string) {
  const user = await getCurrentUser()
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id, archivedAt: null },
    select: { id: true, stageId: true },
  })
  if (!project) throw new Error("That project no longer exists.")

  // Archived rather than deleted: its tasks hang off this row, and a delivered
  // project is part of the record of what you have done.
  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { archivedAt: new Date() } })
    await renumberColumn(tx, user.id, project.stageId)
  })

  revalidatePath("/projects")
  revalidatePath("/calendar")
}

/** A money field as typed, or null. */
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
