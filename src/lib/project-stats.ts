import prisma from "@/lib/db"
import { displayNameFor, memberInitials } from "@/lib/members"
import { projectTrend, type ProjectMonth } from "@/lib/project-trend"

export type { ProjectMonth }

/**
 * The figures behind the Projects screen.
 *
 * Everything is derived from the project rows the board lists, so a count in
 * a card and the number of cards in a column always agree. Stage type is what
 * makes a project active, delivered or dropped, so the operator renaming
 * their columns never breaks the arithmetic.
 */

export type ProjectBreakdown = { label: string; value: number }
export type WorkloadRow = {
  memberId: string
  name: string
  initials: string
  active: number
  delivered: number
  openTasks: number
}

export type ProjectStats = {
  currency: string
  total: number
  active: number
  delivered: number
  dropped: number
  /** Active projects past their deadline. */
  late: number
  /** Active projects with no manager - the gap the board should surface. */
  unmanaged: number
  valueInFlight: number
  deliveredValue: number
  newThisMonth: number
  byCategory: ProjectBreakdown[]
  byStage: ProjectBreakdown[]
  trend: ProjectMonth[]
  workload: WorkloadRow[]
  /** Mean progress across active projects, for the headline bar. */
  averageProgress: number | null
}

function monthStart(now: Date, back: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

export async function getProjectStats(userId: string, now = new Date()): Promise<ProjectStats> {
  const thisMonth = monthStart(now, 0)

  const [profile, projects] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId }, select: { currency: true } }),
    prisma.project.findMany({
      where: { userId, archivedAt: null },
      select: {
        id: true,
        value: true,
        currency: true,
        category: true,
        progress: true,
        deadline: true,
        startedAt: true,
        createdAt: true,
        updatedAt: true,
        stage: { select: { name: true, type: true, position: true } },
        manager: {
          select: {
            id: true,
            user: {
              select: {
                email: true,
                name: true,
                businessProfile: { select: { ownerName: true } },
              },
            },
          },
        },
        tasks: { where: { status: "OPEN" }, select: { id: true } },
      },
    }),
  ])

  const currency = profile?.currency || "INR"
  const inCurrency = (p: (typeof projects)[number]) =>
    p.value != null && (p.currency === currency || !p.currency) ? Number(p.value) : 0

  const active = projects.filter((p) => p.stage.type === "OPEN")
  const delivered = projects.filter((p) => p.stage.type === "WON")
  const dropped = projects.filter((p) => p.stage.type === "LOST")

  // --- breakdowns ----------------------------------------------------------
  const category = new Map<string, number>()
  for (const project of projects) {
    const label = project.category?.trim() || "Uncategorised"
    category.set(label, (category.get(label) ?? 0) + 1)
  }

  const stage = new Map<string, { value: number; position: number }>()
  for (const project of projects) {
    const entry = stage.get(project.stage.name)
    if (entry) entry.value += 1
    else stage.set(project.stage.name, { value: 1, position: project.stage.position })
  }

  // --- trend ---------------------------------------------------------------
  // The windowing lives in lib/project-trend.ts, pure and tested.
  const trend = projectTrend(
    projects.map((p) => ({
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      startedAt: p.startedAt,
      terminal: p.stage.type !== "OPEN",
      won: p.stage.type === "WON",
    })),
    now
  )

  // --- workload ------------------------------------------------------------
  const workload = new Map<string, WorkloadRow>()
  for (const project of projects) {
    if (!project.manager) continue
    const name = displayNameFor(project.manager.user)
    const row =
      workload.get(project.manager.id) ??
      ({
        memberId: project.manager.id,
        name,
        initials: memberInitials(name),
        active: 0,
        delivered: 0,
        openTasks: 0,
      } satisfies WorkloadRow)
    if (project.stage.type === "OPEN") row.active += 1
    if (project.stage.type === "WON") row.delivered += 1
    row.openTasks += project.tasks.length
    workload.set(project.manager.id, row)
  }

  const withProgress = active.filter((p) => p.progress != null)

  return {
    currency,
    total: projects.length,
    active: active.length,
    delivered: delivered.length,
    dropped: dropped.length,
    late: active.filter((p) => p.deadline != null && p.deadline < now).length,
    unmanaged: active.filter((p) => p.manager == null).length,
    valueInFlight: active.reduce((sum, p) => sum + inCurrency(p), 0),
    deliveredValue: delivered.reduce((sum, p) => sum + inCurrency(p), 0),
    newThisMonth: projects.filter((p) => p.createdAt >= thisMonth).length,
    byCategory: [...category.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    byStage: [...stage.entries()]
      .sort((a, b) => a[1].position - b[1].position)
      .map(([label, { value }]) => ({ label, value })),
    trend,
    workload: [...workload.values()].sort((a, b) => b.active - a.active),
    averageProgress:
      withProgress.length > 0
        ? Math.round(
            withProgress.reduce((sum, p) => sum + (p.progress ?? 0), 0) / withProgress.length
          )
        : null,
  }
}
