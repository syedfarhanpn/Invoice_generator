import { randomUUID } from "node:crypto"
import type { PipelineKind, StageType } from "@prisma/client"

import prisma from "@/lib/db"

/**
 * One board primitive, three panels.
 *
 * Leads, projects and tasks are ordered cards in named columns; the only thing
 * that differs is what a card points at. Keeping that in the pipeline's `kind`
 * rather than in three parallel implementations is what lets the stage editor
 * in Settings configure all of them, and one drag-and-drop component serve all
 * of them.
 *
 * The CRM tables came from an earlier codebase and carry no column defaults
 * for id or the timestamps, so every insert here supplies them explicitly.
 */

export type StageSeed = { name: string; type: StageType; probability: number }

/**
 * What a board looks like before you have touched it.
 *
 * LEADS is absent on purpose: that pipeline already exists in the database
 * with the operator's own stages, and seeding over it would replace a real
 * configuration with a guess.
 */
export const DEFAULT_STAGES: Record<Exclude<PipelineKind, "LEADS">, StageSeed[]> = {
  PROJECTS: [
    { name: "Onboarding", type: "OPEN", probability: 0 },
    { name: "Working", type: "OPEN", probability: 0 },
    { name: "QA", type: "OPEN", probability: 0 },
    { name: "In Review", type: "OPEN", probability: 0 },
    { name: "Completed", type: "WON", probability: 0 },
  ],
  TASKS: [
    { name: "To Do", type: "OPEN", probability: 0 },
    { name: "Doing", type: "OPEN", probability: 0 },
    { name: "Done", type: "WON", probability: 0 },
  ],
}

const BOARD_NAME: Record<PipelineKind, string> = {
  LEADS: "Sales pipeline",
  PROJECTS: "Delivery",
  TASKS: "Tasks",
}

/**
 * A board name not already taken by one of this user's pipelines.
 *
 * crm."Pipeline" carries UNIQUE (userId, name), and an operator who happens to
 * have named a pipeline "Tasks" would otherwise make the Tasks board
 * un-creatable with an error that explains nothing.
 */
function availableName(preferred: string, taken: string[]): string {
  const used = new Set(taken)
  if (!used.has(preferred)) return preferred
  for (let n = 2; n < 50; n++) {
    const candidate = `${preferred} ${n}`
    if (!used.has(candidate)) return candidate
  }
  return `${preferred} ${randomUUID().slice(0, 8)}`
}

export type BoardStage = {
  id: string
  name: string
  position: number
  type: StageType
  probability: number
}

export type Board = {
  id: string
  name: string
  kind: PipelineKind
  stages: BoardStage[]
}

/**
 * The board for a kind, created on first use.
 *
 * Seeding lazily rather than in the migration means a new operator gets their
 * boards without a deploy, and re-running it can never duplicate one: the
 * lookup and the insert share a transaction, and the caller is a single user's
 * own request.
 */
export async function ensureBoard(userId: string, kind: PipelineKind): Promise<Board> {
  const existing = await prisma.pipeline.findFirst({
    where: { userId, kind, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
    include: { stages: { orderBy: { position: "asc" } } },
  })

  if (existing) return toBoard(existing)

  // LEADS has no seed - if it is missing, the CRM has not been set up and
  // inventing stages would be a guess at someone's sales process.
  const seed = kind === "LEADS" ? [] : DEFAULT_STAGES[kind]
  const now = new Date()
  const pipelineId = randomUUID()

  // Two unique indexes on this table constrain what a new board may look like.
  // Neither is expressible in the Prisma model, so they are enforced here and
  // spelled out rather than discovered again the hard way:
  //
  //   Pipeline_one_default_per_user  UNIQUE (userId) WHERE isDefault
  //   Pipeline_userId_name_key       UNIQUE (userId, name)
  const siblings = await prisma.pipeline.findMany({
    where: { userId },
    select: { name: true, position: true, isDefault: true },
  })

  const created = await prisma.$transaction(async (tx) => {
    await tx.pipeline.create({
      data: {
        id: pipelineId,
        userId,
        kind,
        name: availableName(BOARD_NAME[kind], siblings.map((s) => s.name)),
        // Exactly one board per user may be the default, and an existing one
        // already holds it. Only the very first board claims it.
        isDefault: siblings.length === 0,
        position: siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1,
        createdAt: now,
        updatedAt: now,
      },
    })

    if (seed.length > 0) {
      await tx.stage.createMany({
        data: seed.map((stage, index) => ({
          id: randomUUID(),
          pipelineId,
          name: stage.name,
          position: index,
          probability: stage.probability,
          type: stage.type,
          createdAt: now,
          updatedAt: now,
        })),
      })
    }

    return tx.pipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      include: { stages: { orderBy: { position: "asc" } } },
    })
  })

  return toBoard(created)
}

type PipelineWithStages = {
  id: string
  name: string
  kind: PipelineKind
  stages: { id: string; name: string; position: number; type: StageType; probability: number }[]
}

function toBoard(pipeline: PipelineWithStages): Board {
  return {
    id: pipeline.id,
    name: pipeline.name,
    kind: pipeline.kind,
    stages: pipeline.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      position: stage.position,
      type: stage.type,
      probability: stage.probability,
    })),
  }
}

/** Guards a stage id against belonging to somebody else's board. */
export async function assertStageInBoard(
  userId: string,
  kind: PipelineKind,
  stageId: string
): Promise<void> {
  const stage = await prisma.stage.findFirst({
    where: { id: stageId, pipeline: { userId, kind, archivedAt: null } },
    select: { id: true },
  })
  if (!stage) throw new Error("That column does not belong to this board.")
}
