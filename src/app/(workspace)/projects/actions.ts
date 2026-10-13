"use server"

import { revalidatePath } from "next/cache"

import { assertStageInBoard, ensureBoard } from "@/lib/boards"
import { compactPositions, positionsAfterMove } from "@/lib/ordering"
import { assertPermission } from "@/lib/access"
import { getCurrentUser } from "@/lib/current-user"
import { currentOrgId, resolveAssignee } from "@/lib/members"
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

/**
 * Whether landing in this stage should offer to set up recurring services.
 *
 * A project reaching deployment or completion is the moment its AMC, domain
 * and hosting become real commitments, and the moment they are most likely to
 * be forgotten - the work is done, everyone moves on, and a year later a
 * domain lapses.
 *
 * WON is structural, so it always qualifies. The name match is for the stage
 * an operator adds themselves - "Hosting & Deployment", "Deployed", "Go live"
 * - because the board's columns are theirs to name and nothing in the schema
 * marks one as the handover point. A stage that matches neither simply does
 * not prompt, so a board named in another vocabulary loses nothing it had.
 */
const HANDOVER_STAGE = /host|deploy|go.?live|launch/i

export type MoveProjectResult = {
  /** Set when the destination is a handover stage, so the board can offer
   *  to record what now renews. Null otherwise. */
  offerServices: { projectId: string; title: string; stageName: string } | null
}

export async function moveProject(
  projectId: string,
  toStageId: string,
  toIndex: number
): Promise<MoveProjectResult> {
  await assertPermission("projects", "write")
  const user = await getCurrentUser()
  await assertStageInBoard(user.id, "PROJECTS", toStageId)

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id, archivedAt: null },
    select: { id: true, stageId: true, title: true },
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
  revalidatePath("/renewals")

  // Only on an actual change of column. Reordering within the same one is not
  // a handover and must not nag.
  if (fromStageId === toStageId) return { offerServices: null }

  const stage = await prisma.stage.findUnique({
    where: { id: toStageId },
    select: { name: true, type: true },
  })
  if (!stage) return { offerServices: null }

  const qualifies = stage.type === "WON" || HANDOVER_STAGE.test(stage.name)
  return {
    offerServices: qualifies
      ? { projectId, title: project.title, stageName: stage.name }
      : null,
  }
}

export async function createProject(stageId: string, title: string) {
  await assertPermission("projects", "write")
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
      orgId: await currentOrgId(user.id),
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
 * Creates a project with everything known about it up front.
 *
 * The inline card on the board took a title and nothing else, which meant
 * every new project needed opening and editing immediately afterwards. This
 * takes the same fields the editor does, so a project can be entered once.
 *
 * Shares its validation with updateProject() rather than reimplementing it:
 * the two must agree about what a valid value, deadline and progress are.
 */
export async function createProjectWithDetails(input: {
  stageId: string
  title: string
  clientId: string | null
  managerId: string | null
  category: string | null
  progress: string | null
  value: string | null
  startedAt: string | null
  deadline: string | null
  description: string | null
}) {
  await assertPermission("projects", "write")
  const user = await getCurrentUser()
  const title = input.title.trim()
  if (!title) throw new Error("A project needs a title.")

  await assertStageInBoard(user.id, "PROJECTS", input.stageId)
  const board = await ensureBoard(user.id, "PROJECTS")
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { currency: true },
  })

  let clientId: string | null = null
  if (input.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, userId: user.id },
      select: { id: true },
    })
    if (!client) throw new Error("That client does not exist.")
    clientId = client.id
  }

  const last = await prisma.project.findFirst({
    where: { userId: user.id, stageId: input.stageId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  })

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      orgId: await currentOrgId(user.id),
      pipelineId: board.id,
      stageId: input.stageId,
      title,
      clientId,
      managerId: await resolveAssignee(user.id, input.managerId),
      category: input.category?.trim() || null,
      progress: parseProgress(input.progress),
      value: parseAmount(input.value),
      startedAt: parseDay(input.startedAt),
      deadline: parseDay(input.deadline),
      description: input.description?.trim() || null,
      currency: profile?.currency || "INR",
      position: (last?.position ?? -1) + 1,
    },
    select: { id: true },
  })

  revalidatePath("/projects")
  revalidatePath("/calendar")
  return project.id
}

/**
 * Records what a delivered project now costs and earns, month after month.
 *
 * Offered on handover rather than created automatically: not every site comes
 * with an AMC, and a renewal nobody agreed to would put a false commitment on
 * the Renewals screen and in the margin figures.
 *
 * Each service is an ordinary Subscription row - the same table the Renewals
 * tabs read - so nothing here is a special case downstream. The note is
 * carried onto every row created, because the thing worth remembering a year
 * from now ("client owns the domain, renew via their GoDaddy") applies to all
 * of them.
 */
export async function addProjectServices(input: {
  projectId: string
  note: string | null
  services: {
    kind: "AMC" | "DOMAIN" | "HOSTING"
    name: string
    renewsOn: string
    cycle: string
    cost: string
    price: string
    autoRenew: boolean
  }[]
}) {
  await assertPermission("projects", "write")
  const user = await getCurrentUser()

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: user.id, archivedAt: null },
    select: { id: true, clientId: true, title: true },
  })
  if (!project) throw new Error("That project no longer exists.")

  const wanted = input.services.filter((s) => s.name.trim() && s.renewsOn.trim())
  if (wanted.length === 0) return 0

  // Each kind is gated on its own module, the same rule the Renewals actions
  // apply: being allowed to manage projects is not being allowed to create
  // somebody's hosting bill.
  for (const service of new Set(wanted.map((s) => s.kind))) {
    await assertPermission(moduleForSubscriptionKind(service), "write")
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { currency: true },
  })
  const currency = profile?.currency || "INR"
  const orgId = await currentOrgId(user.id)
  const note = input.note?.trim() || null
  const now = new Date()

  await prisma.subscription.createMany({
    data: wanted.map((service) => {
      const renewsOn = parseDay(service.renewsOn) ?? now
      return {
        userId: user.id,
        orgId,
        projectId: project.id,
        clientId: project.clientId,
        kind: service.kind,
        name: service.name.trim(),
        startsOn: now,
        renewsOn,
        cycle: parseCycle(service.cycle),
        cost: parseAmount(service.cost),
        price: parseAmount(service.price),
        currency,
        autoRenew: Boolean(service.autoRenew),
        status: "ACTIVE" as const,
        notes: note,
      }
    }),
  })

  revalidatePath("/renewals")
  revalidatePath("/projects")
  return wanted.length
}

function moduleForSubscriptionKind(kind: "AMC" | "DOMAIN" | "HOSTING") {
  return kind === "AMC" ? ("renewals" as const) : ("domains" as const)
}

const CYCLES = [
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
  "BIENNIAL",
  "TRIENNIAL",
] as const

function parseCycle(value: string): (typeof CYCLES)[number] {
  return (CYCLES as readonly string[]).includes(value)
    ? (value as (typeof CYCLES)[number])
    : "YEARLY"
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
  await assertPermission("projects", "write")
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
      orgId: await currentOrgId(user.id),
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
  managerId: string | null
  category: string | null
  progress: string | null
  value: string | null
  startedAt: string | null
  deadline: string | null
  description: string | null
}) {
  await assertPermission("projects", "write")
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

  const managerId = await resolveAssignee(user.id, input.managerId)

  await prisma.project.update({
    where: { id: input.projectId },
    data: {
      title,
      clientId,
      managerId,
      category: input.category?.trim() || null,
      progress: parseProgress(input.progress),
      value: parseAmount(input.value),
      // Only ever set by the convert-from-deal path until now, so most rows
      // carry none and the list falls back to createdAt. Editable here so a
      // project that began before it was entered can say so.
      startedAt: parseDay(input.startedAt),
      deadline: parseDay(input.deadline),
      description: input.description?.trim() || null,
    },
  })

  revalidatePath("/projects")
  revalidatePath("/calendar")
}

export async function archiveProject(projectId: string) {
  await assertPermission("projects", "write")
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

/**
 * A progress percentage, clamped rather than rejected.
 *
 * Someone typing 150 means "nearly there", not "abort the save". The database
 * has a CHECK for the same range, so this is the friendly half of a guard that
 * is enforced either way.
 */
function parseProgress(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(100, Math.round(parsed)))
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
