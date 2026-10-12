import { monthsInRange, type ReportRange } from "@/lib/report-range"

/**
 * The Projects report.
 *
 * Status comes from the board's stage TYPE, not from a parallel status column:
 * a project is delivered because it sits in a WON stage, dropped because it
 * sits in a LOST one, and active otherwise. The operator can rename and
 * reorder their columns freely and these counts keep working.
 *
 * "On hold" and "cancelled" from the brief map onto what the board can
 * actually express. A LOST stage is the cancelled case. On-hold has no stage
 * type of its own, so rather than inventing one, a project is reported as
 * STALLED - active, started, and nothing has moved for a month. That is
 * observable from the data; a hold nobody recorded is not.
 */

export type ProjectRow = {
  id: string
  title: string
  clientName: string | null
  category: string | null
  stageName: string
  stageType: "OPEN" | "WON" | "LOST"
  stagePosition: number
  value: number | null
  currency: string
  progress: number | null
  startedAt: Date | null
  deadline: Date | null
  createdAt: Date
  updatedAt: Date
  managerId: string | null
  managerName: string | null
  openTasks: number
}

export type Breakdown = { label: string; value: number }

export type WorkloadRow = {
  id: string
  name: string
  active: number
  delivered: number
  openTasks: number
  valueInFlight: number
}

export type ProjectsReport = {
  currency: string
  total: number
  active: number
  delivered: number
  dropped: number
  /** Active, started, untouched for a month - see the note above. */
  stalled: number
  /** Past deadline and not delivered. */
  late: number
  started: number
  previousStarted: number
  valueInFlight: number
  deliveredValue: number
  averageProgress: number | null
  unmanaged: number
  byStatus: Breakdown[]
  byCategory: Breakdown[]
  byClient: Breakdown[]
  trend: { label: string; started: number; delivered: number }[]
  workload: WorkloadRow[]
  upcoming: ProjectRow[]
  rows: ProjectRow[]
}

const STALE_DAYS = 30
const DAY_MS = 86_400_000

export function summariseProjects(
  rows: ProjectRow[],
  previousStarted: number,
  currency: string,
  range: ReportRange,
  now = new Date()
): ProjectsReport {
  const active = rows.filter((r) => r.stageType === "OPEN")
  const delivered = rows.filter((r) => r.stageType === "WON")
  const dropped = rows.filter((r) => r.stageType === "LOST")

  const amountOf = (row: ProjectRow) =>
    row.value != null && (!row.currency || row.currency === currency) ? Number(row.value) : 0

  const staleBefore = new Date(now.getTime() - STALE_DAYS * DAY_MS)
  const stalled = active.filter((r) => r.startedAt != null && r.updatedAt < staleBefore)

  const late = active.filter((r) => r.deadline != null && r.deadline.getTime() < now.getTime())

  const started = rows.filter((r) => {
    const at = r.startedAt ?? r.createdAt
    return (!range.from || at >= range.from) && at < range.to
  }).length

  const category = new Map<string, number>()
  const client = new Map<string, number>()
  const byManager = new Map<string, WorkloadRow>()

  for (const row of rows) {
    const categoryLabel = row.category?.trim() || "Not categorised"
    category.set(categoryLabel, (category.get(categoryLabel) ?? 0) + 1)

    // Named explicitly rather than dropped, so the parts sum to the whole.
    const clientLabel = row.clientName?.trim() || "No client"
    client.set(clientLabel, (client.get(clientLabel) ?? 0) + 1)

    const managerId = row.managerId ?? "__unmanaged"
    const entry =
      byManager.get(managerId) ??
      ({
        id: managerId,
        name: row.managerName ?? "Nobody assigned",
        active: 0,
        delivered: 0,
        openTasks: 0,
        valueInFlight: 0,
      } satisfies WorkloadRow)

    if (row.stageType === "OPEN") {
      entry.active += 1
      entry.valueInFlight += amountOf(row)
    } else if (row.stageType === "WON") entry.delivered += 1
    entry.openTasks += row.openTasks

    byManager.set(managerId, entry)
  }

  const months = monthsInRange(range)
  const trend = months.map((month) => ({
    label: month.label,
    started: rows.filter((r) => {
      const at = r.startedAt ?? r.createdAt
      return at >= month.start && at < month.end
    }).length,
    // Approximated by updatedAt, which is when the card was last moved. The
    // board records no "delivered on" date, so this is the closest honest
    // answer rather than a fabricated one.
    delivered: rows.filter(
      (r) => r.stageType === "WON" && r.updatedAt >= month.start && r.updatedAt < month.end
    ).length,
  }))

  // Only over projects where someone has actually recorded a figure. Treating
  // an unset progress as 0% would report a busy studio as barely started.
  const withProgress = active.filter((r) => r.progress != null)

  return {
    currency,
    total: rows.length,
    active: active.length,
    delivered: delivered.length,
    dropped: dropped.length,
    stalled: stalled.length,
    late: late.length,
    started,
    previousStarted,
    valueInFlight: active.reduce((sum, r) => sum + amountOf(r), 0),
    deliveredValue: delivered.reduce((sum, r) => sum + amountOf(r), 0),
    averageProgress:
      withProgress.length > 0
        ? withProgress.reduce((sum, r) => sum + (r.progress ?? 0), 0) / withProgress.length
        : null,
    unmanaged: active.filter((r) => !r.managerId).length,
    byStatus: [
      { label: "Active", value: active.length },
      { label: "Delivered", value: delivered.length },
      { label: "Dropped", value: dropped.length },
    ].filter((s) => s.value > 0),
    byCategory: [...category.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    byClient: [...client.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    trend,
    workload: [...byManager.values()].sort((a, b) => b.active - a.active || b.openTasks - a.openTasks),
    upcoming: active
      .filter((r) => r.deadline != null)
      .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime())
      .slice(0, 10),
    rows,
  }
}
