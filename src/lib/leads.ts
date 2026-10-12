import prisma from "@/lib/db"

/**
 * The figures behind the Sales & Leads screen.
 *
 * "Lead" and "deal" are the same row here: a Deal moving through a LEADS
 * pipeline. Stage type is what makes a deal open, won or lost, so conversion
 * is counted from stage rows rather than from a second status column that
 * could drift away from the board.
 *
 * The reference also shows an assigned salesperson per lead. Deal carries no
 * assignee yet; that needs a column, and the module is honest about its
 * absence rather than inventing one.
 */

export type LeadBreakdown = { label: string; value: number }
/** Three series, because the reference trend groups them per month. */
export type LeadMonth = { label: string; total: number; qualified: number; won: number }

export type LeadStats = {
  currency: string
  total: number
  /** Deals sitting in an open stage past the first one. */
  qualified: number
  won: number
  lost: number
  open: number
  /** Won deals as a share of every lead taken on, matching the reference. */
  conversionRate: number
  /** Value of everything still open - the pipeline, not the takings. */
  pipelineValue: number
  wonValue: number
  newThisMonth: number
  previousMonthTotal: number
  bySource: LeadBreakdown[]
  byStage: LeadBreakdown[]
  trend: LeadMonth[]
  /** Open deals with no next action booked - the list that needs you. */
  stalled: number
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })

function monthStart(now: Date, back: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

export async function getLeadStats(userId: string, now = new Date()): Promise<LeadStats> {
  const thisMonth = monthStart(now, 0)
  const lastMonth = monthStart(now, 1)
  const sixBack = monthStart(now, 5)

  const [profile, deals] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId }, select: { currency: true } }),
    prisma.deal.findMany({
      where: { userId, archivedAt: null, pipeline: { kind: "LEADS" } },
      select: {
        id: true,
        value: true,
        currency: true,
        source: true,
        createdAt: true,
        stage: { select: { name: true, type: true, position: true } },
        tasks: { where: { status: "OPEN" }, select: { id: true }, take: 1 },
      },
    }),
  ])

  const currency = profile?.currency || "INR"

  const won = deals.filter((d) => d.stage.type === "WON")
  const lost = deals.filter((d) => d.stage.type === "LOST")
  const open = deals.filter((d) => d.stage.type === "OPEN")

  // "Qualified" is anything that has moved beyond the first column. Naming a
  // specific stage would break the moment the operator renames their own.
  const firstOpenPosition = Math.min(
    ...open.map((d) => d.stage.position),
    ...deals.map((d) => d.stage.position)
  )
  const qualified = open.filter((d) => d.stage.position > firstOpenPosition).length

  const inCurrency = (d: (typeof deals)[number]) =>
    d.value != null && (d.currency === currency || !d.currency) ? Number(d.value) : 0

  // --- breakdowns ----------------------------------------------------------
  const sourceCounts = new Map<string, number>()
  for (const deal of deals) {
    const label = deal.source?.trim() || "Not recorded"
    sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1)
  }

  const stageCounts = new Map<string, { value: number; position: number }>()
  for (const deal of deals) {
    const entry = stageCounts.get(deal.stage.name)
    if (entry) entry.value += 1
    else stageCounts.set(deal.stage.name, { value: 1, position: deal.stage.position })
  }

  // --- trend ---------------------------------------------------------------
  const monthly = new Map<string, { total: number; qualified: number; won: number }>()
  for (const deal of deals) {
    if (deal.createdAt < sixBack) continue
    const key = `${deal.createdAt.getUTCFullYear()}-${String(deal.createdAt.getUTCMonth() + 1).padStart(2, "0")}`
    const entry = monthly.get(key) ?? { total: 0, qualified: 0, won: 0 }
    entry.total += 1
    // Qualified by the same rule the headline uses: past the first column.
    // Bucketed by the month the lead arrived, so the three bars in a month
    // are three readings of the same cohort rather than three populations.
    if (deal.stage.position > firstOpenPosition) entry.qualified += 1
    if (deal.stage.type === "WON") entry.won += 1
    monthly.set(key, entry)
  }

  const trend: LeadMonth[] = Array.from({ length: 6 }, (_, i) => {
    const date = monthStart(now, 5 - i)
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
    const entry = monthly.get(key) ?? { total: 0, qualified: 0, won: 0 }
    return {
      label: MONTH_LABEL.format(date),
      total: entry.total,
      qualified: entry.qualified,
      won: entry.won,
    }
  })

  return {
    currency,
    total: deals.length,
    qualified,
    won: won.length,
    lost: lost.length,
    open: open.length,
    // Of every lead taken on, not only those that closed. Dividing by
    // closed deals alone reports 100% the moment nothing has been lost yet,
    // which is true and useless. This is the conventional reading and the
    // one the reference uses.
    conversionRate: deals.length > 0 ? (won.length / deals.length) * 100 : 0,
    pipelineValue: open.reduce((sum, d) => sum + inCurrency(d), 0),
    wonValue: won.reduce((sum, d) => sum + inCurrency(d), 0),
    newThisMonth: deals.filter((d) => d.createdAt >= thisMonth).length,
    previousMonthTotal: deals.filter((d) => d.createdAt >= lastMonth && d.createdAt < thisMonth)
      .length,
    bySource: [...sourceCounts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    byStage: [...stageCounts.entries()]
      .sort((a, b) => a[1].position - b[1].position)
      .map(([label, { value }]) => ({ label, value })),
    trend,
    stalled: open.filter((d) => d.tasks.length === 0).length,
  }
}
