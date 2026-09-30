"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import type { PipelineKind, StageType } from "@prisma/client"

import { ensureBoard } from "@/lib/boards"
import { getCurrentUser } from "@/lib/current-user"
import prisma from "@/lib/db"

/**
 * Stage configuration, shared by all three boards.
 *
 * Stages are rows rather than an enum precisely so this screen can exist: the
 * columns on every panel are the operator's own words for their own process,
 * and changing them is a save, not a deploy.
 */

const KINDS: PipelineKind[] = ["LEADS", "PROJECTS", "TASKS"]
const TYPES: StageType[] = ["OPEN", "WON", "LOST"]

/** Which routes a stage change can be seen on. */
function revalidateBoards() {
  revalidatePath("/crm")
  revalidatePath("/projects")
  revalidatePath("/tasks")
  revalidatePath("/calendar")
  revalidatePath("/dashboard/settings/boards")
}

function parseKind(value: string): PipelineKind {
  if (!KINDS.includes(value as PipelineKind)) throw new Error("Unknown board.")
  return value as PipelineKind
}

/** Confirms a stage is on a board this user owns before anything touches it. */
async function ownedStage(userId: string, stageId: string) {
  const stage = await prisma.stage.findFirst({
    where: { id: stageId, pipeline: { userId } },
    select: { id: true, pipelineId: true, position: true, pipeline: { select: { kind: true } } },
  })
  if (!stage) throw new Error("That column no longer exists.")
  return stage
}

export async function addStage(kindValue: string, name: string, typeValue: string) {
  const user = await getCurrentUser()
  const kind = parseKind(kindValue)
  const clean = name.trim()
  if (!clean) throw new Error("A column needs a name.")

  const type = TYPES.includes(typeValue as StageType) ? (typeValue as StageType) : "OPEN"
  const board = await ensureBoard(user.id, kind)

  const last = await prisma.stage.findFirst({
    where: { pipelineId: board.id },
    orderBy: { position: "desc" },
    select: { position: true },
  })

  const now = new Date()
  await prisma.stage.create({
    data: {
      id: randomUUID(),
      pipelineId: board.id,
      name: clean,
      position: (last?.position ?? -1) + 1,
      probability: 0,
      type,
      createdAt: now,
      updatedAt: now,
    },
  })

  revalidateBoards()
}

export async function renameStage(stageId: string, name: string) {
  const user = await getCurrentUser()
  const clean = name.trim()
  if (!clean) throw new Error("A column needs a name.")

  await ownedStage(user.id, stageId)
  await prisma.stage.update({
    where: { id: stageId },
    data: { name: clean, updatedAt: new Date() },
  })

  revalidateBoards()
}

export async function setStageType(stageId: string, typeValue: string) {
  const user = await getCurrentUser()
  if (!TYPES.includes(typeValue as StageType)) throw new Error("Unknown column type.")

  await ownedStage(user.id, stageId)
  await prisma.stage.update({
    where: { id: stageId },
    data: { type: typeValue as StageType, updatedAt: new Date() },
  })

  revalidateBoards()
}

/** Swaps a column with its neighbour. One step at a time keeps this a pair of
 *  writes rather than a rewrite of the whole board. */
export async function moveStage(stageId: string, direction: "up" | "down") {
  const user = await getCurrentUser()
  const stage = await ownedStage(user.id, stageId)

  const neighbour = await prisma.stage.findFirst({
    where: {
      pipelineId: stage.pipelineId,
      position: direction === "up" ? { lt: stage.position } : { gt: stage.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
    select: { id: true, position: true },
  })
  if (!neighbour) return // already at the end

  const now = new Date()
  await prisma.$transaction([
    prisma.stage.update({
      where: { id: stage.id },
      data: { position: neighbour.position, updatedAt: now },
    }),
    prisma.stage.update({
      where: { id: neighbour.id },
      data: { position: stage.position, updatedAt: now },
    }),
  ])

  revalidateBoards()
}

/**
 * Removes an empty column.
 *
 * Refuses while anything is still in it rather than deciding where those cards
 * should go. Silently relocating somebody's work to make a delete succeed is
 * the kind of helpfulness nobody asks for twice.
 */
export async function deleteStage(stageId: string) {
  const user = await getCurrentUser()
  const stage = await ownedStage(user.id, stageId)

  const [deals, projects, tasks, siblings] = await Promise.all([
    prisma.deal.count({ where: { stageId, archivedAt: null } }),
    prisma.project.count({ where: { stageId, archivedAt: null } }),
    prisma.task.count({ where: { stageId } }),
    prisma.stage.count({ where: { pipelineId: stage.pipelineId } }),
  ])

  const occupants = deals + projects + tasks
  if (occupants > 0) {
    throw new Error(
      `That column still holds ${occupants} card${occupants === 1 ? "" : "s"}. Move them out first.`
    )
  }
  if (siblings <= 1) throw new Error("A board needs at least one column.")

  await prisma.$transaction(async (tx) => {
    await tx.stage.delete({ where: { id: stageId } })
    // Close the gap so positions stay 0..n-1.
    const rest = await tx.stage.findMany({
      where: { pipelineId: stage.pipelineId },
      orderBy: { position: "asc" },
      select: { id: true },
    })
    for (const [index, row] of rest.entries()) {
      await tx.stage.update({ where: { id: row.id }, data: { position: index } })
    }
  })

  revalidateBoards()
}
