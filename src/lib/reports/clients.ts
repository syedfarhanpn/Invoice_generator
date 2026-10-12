import { monthsInRange, type ReportRange } from "@/lib/report-range"

/**
 * The Clients report.
 *
 * "Active" is the one word here that could mean several things, so it is
 * pinned to something observable: a client is active if they have live work -
 * an unarchived project that is not finished, or an invoice still owed. Not
 * "created recently", which would make a five-year client inactive, and not a
 * stored flag, which would be wrong the moment anyone forgot to set it.
 *
 * Revenue per client is money RECEIVED, not money invoiced. A client who owes
 * ₹2L has not paid ₹2L, and a "top clients by revenue" table that ranks by
 * what was billed will put your worst payer at the top.
 */

export type ClientRow = {
  id: string
  name: string
  industry: string | null
  createdAt: Date
  archivedAt: Date | null
  projects: number
  activeProjects: number
  /** Received, in the workspace currency. */
  revenue: number
  outstanding: number
  documents: number
  lastActivityAt: Date | null
}

export type Breakdown = { label: string; value: number }

export type ClientsReport = {
  currency: string
  total: number
  /** Has live work - see the note above. */
  active: number
  inactive: number
  archived: number
  /** Created inside the range. */
  added: number
  previousAdded: number
  revenue: number
  outstanding: number
  averageRevenue: number
  /** Cumulative client count at each month end. */
  growth: { label: string; total: number }[]
  byIndustry: Breakdown[]
  byStatus: Breakdown[]
  /** How many clients have 0, 1, 2-3, 4+ projects. */
  byProjectCount: Breakdown[]
  topByRevenue: ClientRow[]
  /** Nothing recorded against them inside the range. */
  dormant: ClientRow[]
  rows: ClientRow[]
}

const PROJECT_BANDS: { label: string; test: (n: number) => boolean }[] = [
  { label: "No projects", test: (n) => n === 0 },
  { label: "1 project", test: (n) => n === 1 },
  { label: "2-3 projects", test: (n) => n >= 2 && n <= 3 },
  { label: "4 or more", test: (n) => n >= 4 },
]

export function summariseClients(
  rows: ClientRow[],
  previousAdded: number,
  currency: string,
  range: ReportRange
): ClientsReport {
  const live = rows.filter((r) => !r.archivedAt)

  const isActive = (row: ClientRow) => row.activeProjects > 0 || row.outstanding > 0
  const active = live.filter(isActive)

  const added = rows.filter(
    (r) => (!range.from || r.createdAt >= range.from) && r.createdAt < range.to
  ).length

  const industry = new Map<string, number>()
  for (const row of live) {
    const label = row.industry?.trim() || "Not recorded"
    industry.set(label, (industry.get(label) ?? 0) + 1)
  }

  // Cumulative, not per-month: "client base" is a running total, and drawing
  // it as monthly additions would show a healthy business shrinking in any
  // month it happened to sign nobody.
  const months = monthsInRange(range)
  const growth = months.map((month) => ({
    label: month.label,
    total: rows.filter((r) => r.createdAt < month.end && !r.archivedAt).length,
  }))

  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const outstanding = rows.reduce((sum, r) => sum + r.outstanding, 0)
  const earning = rows.filter((r) => r.revenue > 0)

  return {
    currency,
    total: live.length,
    active: active.length,
    inactive: live.length - active.length,
    archived: rows.length - live.length,
    added,
    previousAdded,
    revenue,
    outstanding,
    // Averaged over clients who have actually paid something. Including the
    // ones who never have drags the figure toward a number that describes
    // nobody.
    averageRevenue: earning.length > 0 ? revenue / earning.length : 0,
    growth,
    byIndustry: [...industry.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    byStatus: [
      { label: "Active", value: active.length },
      { label: "No live work", value: live.length - active.length },
      { label: "Archived", value: rows.length - live.length },
    ].filter((s) => s.value > 0),
    byProjectCount: PROJECT_BANDS.map((band) => ({
      label: band.label,
      value: live.filter((r) => band.test(r.projects)).length,
    })).filter((b) => b.value > 0),
    topByRevenue: [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    dormant: live
      .filter((r) => !isActive(r) && r.revenue === 0)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10),
    rows: [...live].sort((a, b) => b.revenue - a.revenue),
  }
}
