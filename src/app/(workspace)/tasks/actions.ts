"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import type { TaskPriority } from "@prisma/client"

import { assertStageInBoard, ensureBoard } from "@/lib/boards"
import { compactPositions, positionsAfterMove } from "@/lib/ordering"
import { renumber } from "@/lib/renumber"
import { assertPermission } from "@/lib/access"
import { currentOrgId, resolveAssignee } from "@/lib/members"
import prisma from "@/lib/db"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

/**
 * Writes for the Tasks board.
 *
 * `status` and the board column are kept in step deliberately: dragging a card
 * into a WON column completes the task, and dragging it back out reopens it.
 * Two places recording done-ness that could disagree would be worse than one
 * that is sometimes redundant - and `status` is what the calendar, the agenda
 * and the reminder poll all read.
 */

const PRIORITIES: TaskPriority[] = ["LOW", "NORMAL", "HIGH"]

async function renumberColumn(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  stageId: string,
  movedId?: string,
  toIndex?: number
) {
  const rows = await tx.task.findMany({
    where: { userId, stageId },
    orderBy: { position: "asc" },
    select: { id: true },
  })

  const ordered =
    movedId != null && toIndex != null
      ? positionsAfterMove(rows, movedId, toIndex)
      : compactPositions(rows)

  // One statement, not one per card - see the note in lib/renumber.ts.
  await renumber(tx, "task", userId, ordered)
}

export async function moveTask(taskId: string, toStageId: string, toIndex: number) {
  await assertPermission("tasks", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  await assertStageInBoard(workspaceId, "TASKS", toStageId)

  const [task, stage] = await Promise.all([
    prisma.task.findFirst({
      where: { id: taskId, userId: workspaceId },
      select: { id: true, stageId: true, status: true },
    }),
    prisma.stage.findUnique({ where: { id: toStageId }, select: { type: true } }),
  ])
  if (!task) throw new Error("That task no longer exists.")

  const fromStageId = task.stageId
  const closing = stage?.type === "WON"
  const cancelling = stage?.type === "LOST"

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        stageId: toStageId,
        status: closing ? "DONE" : cancelling ? "CANCELLED" : "OPEN",
        // Stamped on the way in, cleared on the way out, so a reopened task
        // does not keep claiming it was finished last Tuesday.
        completedAt: closing ? new Date() : null,
        updatedAt: new Date(),
      },
    })
    await renumberColumn(tx, workspaceId, toStageId, taskId, toIndex)
    if (fromStageId && fromStageId !== toStageId) {
      await renumberColumn(tx, workspaceId, fromStageId)
    }
  })

  revalidatePath("/tasks")
  revalidatePath("/calendar")
  revalidatePath("/dashboard")
}

export async function createTask(stageId: string, title: string) {
  await assertPermission("tasks", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const clean = title.trim()
  if (!clean) throw new Error("A task needs a title.")

  await assertStageInBoard(workspaceId, "TASKS", stageId)
  const board = await ensureBoard(workspaceId, "TASKS")

  const last = await prisma.task.findFirst({
    where: { userId: workspaceId, stageId },
    orderBy: { position: "desc" },
    select: { position: true },
  })

  const now = new Date()
  await prisma.task.create({
    data: {
      // The CRM tables carry no column defaults for these - see src/lib/boards.ts.
      id: randomUUID(),
      userId: workspaceId,
      orgId: await currentOrgId(workspaceId),
      pipelineId: board.id,
      stageId,
      title: clean,
      status: "OPEN",
      priority: "NORMAL",
      position: (last?.position ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    },
  })

  revalidatePath("/tasks")
  revalidatePath("/calendar")
}

/**
 * Sets when a task is due and when to be reminded.
 *
 * Both arrive as "YYYY-MM-DDTHH:mm" from a datetime-local input, which carries
 * no zone. They are read as the operator's own clock (IST) rather than UTC,
 * because "due at 5pm" means five in the afternoon where they are, and a naive
 * parse would file it five and a half hours out.
 */
export async function scheduleTask(input: {
  taskId: string
  title?: string
  assigneeId?: string | null
  dueAt: string | null
  remindAt: string | null
  priority?: string
  notes?: string | null
}) {
  await assertPermission("tasks", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const task = await prisma.task.findFirst({
    where: { id: input.taskId, userId: workspaceId },
    select: { id: true },
  })
  if (!task) throw new Error("That task no longer exists.")

  const dueAt = parseLocalDateTime(input.dueAt)
  const remindAt = parseLocalDateTime(input.remindAt)
  const priority = PRIORITIES.includes(input.priority as TaskPriority)
    ? (input.priority as TaskPriority)
    : undefined

  const title = input.title?.trim()
  if (input.title !== undefined && !title) throw new Error("A task needs a title.")

  const assigneeId =
    input.assigneeId === undefined ? undefined : await resolveAssignee(workspaceId, input.assigneeId)

  await prisma.task.update({
    where: { id: input.taskId },
    data: {
      ...(title ? { title } : {}),
      ...(assigneeId !== undefined ? { assigneeId } : {}),
      dueAt,
      // Rescheduling clears the stamp, so a moved reminder fires again rather
      // than staying silent because the old one already went out.
      remindAt,
      notifiedAt: null,
      ...(priority ? { priority } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      updatedAt: new Date(),
    },
  })

  revalidatePath("/tasks")
  revalidatePath("/calendar")
  revalidatePath("/dashboard")
}

/** IST is a fixed +05:30 with no DST, so the offset can be written literally. */
const OPERATOR_OFFSET = "+05:30"

function parseLocalDateTime(value: string | null | undefined): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  // "2026-09-24" from a date input, "2026-09-24T17:00" from datetime-local,
  // occasionally with seconds. Normalise to a full ISO local time, then pin
  // the zone so the instant is unambiguous.
  const local =
    trimmed.length === 10
      ? `${trimmed}T09:00:00` // a date with no time means the start of the working day
      : trimmed.length === 16
        ? `${trimmed}:00`
        : trimmed

  const parsed = new Date(`${local}${OPERATOR_OFFSET}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function setTaskDone(taskId: string, done: boolean) {
  await assertPermission("tasks", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const board = await ensureBoard(workspaceId, "TASKS")

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: workspaceId },
    select: { id: true },
  })
  if (!task) throw new Error("That task no longer exists.")

  // Checking a task off from the calendar or the agenda has to land it in the
  // right column too, or the board would disagree with the tick.
  const target = board.stages.find((stage) => (done ? stage.type === "WON" : stage.type === "OPEN"))

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: done ? "DONE" : "OPEN",
      completedAt: done ? new Date() : null,
      ...(target ? { stageId: target.id, pipelineId: board.id } : {}),
      updatedAt: new Date(),
    },
  })

  revalidatePath("/tasks")
  revalidatePath("/calendar")
  revalidatePath("/dashboard")
}
