import type { ReportRange } from "@/lib/report-range"
import { monthsInRange } from "@/lib/report-range"

/**
 * The Sales & Leads report.
 *
 * "Lead" and "deal" are one row: a Deal on a LEADS pipeline. Stage TYPE is
 * what makes a deal open, won or lost, so every count here comes from the
 * board rather than from a second status column that could drift away from it.
 *
 * Two definitions are kept deliberately in step with the Sales & Leads screen
 * (src/lib/leads.ts), because a report that disagrees with the page it reports
 * on is worse than no report:
 *
 *  - Qualified means "has moved past the first column", not a named stage.
 *    Naming one breaks the moment the operator renames their own.
 *  - Conversion is won / every lead taken on, NOT won / closed. The latter
 *    reports 100% the moment nothing has been lost yet, which is true and
 *    useless.
 */

export type SalesLead = {
  id: string
  title: string
  value: number | null
  currency: string
  source: string | null
  createdAt: Date
  closedAt: Date | null
  stageName: string
  stageType: "OPEN" | "WON" | "LOST"
  stagePosition: number
  clientName: string | null
  ownerId: string | null
  ownerName: string | null
  hasOpenTask: boolean
}

export type Breakdown = { label: string; value: number }

export type SalespersonRow = {
  id: string
  name: string
  taken: number
  won: number
  lost: number
  open: number
  wonValue: number
  /** won / taken, as a percentage. */
  conversionRate: number
}

export type FunnelStep = {
  label: string
  value: number
  /** Share of the widest step, for the bar width. */
  share: number
}

export type SalesReport = {
  currency: string
  total: number
  qualified: number
  won: number
  lost: number
  open: number
  conversionRate: number
  previousTotal: number
  previousWon: number
  pipelineValue: number
  wonValue: number
  averageDealValue: number
  /** Open leads with no next action booked. */
  stalled: number
  bySource: Breakdown[]
  byStage: Breakdown[]
  trend: { label: string; total: number; won: number }[]
  funnel: FunnelStep[]
  salespeople: SalespersonRow[]
  /** The ten most recent, for the card on screen. */
  recent: SalesLead[]
  /** Every lead in the period, for the export. */
  rows: SalesLead[]
  otherCurrencyCount: number
}

/**
 * Every figure, from leads already filtered to the range.
 *
 * `previous` is the same shape for the comparison period, counted but not
 * broken down - a "vs last month" needs two numbers, not two reports.
 */
export function summariseSales(
  leads: SalesLead[],
  previous: SalesLead[],
  currency: string,
  range: ReportRange
): SalesReport {
  const won = leads.filter((l) => l.stageType === "WON")
  const lost = leads.filter((l) => l.stageType === "LOST")
  const open = leads.filter((l) => l.stageType === "OPEN")

  // The first column of the board, taken from the data rather than named.
  const firstPosition = leads.length > 0 ? Math.min(...leads.map((l) => l.stagePosition)) : 0
  const qualified = leads.filter((l) => l.stagePosition > firstPosition).length

  // Only money in the workspace currency is summed, as everywhere else.
  const inCurrency = (lead: SalesLead): boolean =>
    lead.value != null && (!lead.currency || lead.currency === currency)
  const amountOf = (lead: SalesLead): number => (inCurrency(lead) ? Number(lead.value) : 0)

  // Counted over every lead in one pass, not as a side effect of the two
  // reduces below - those only visit open and won leads, so a lost lead
  // priced in dollars would never have been mentioned.
  const otherCurrencyCount = leads.filter(
    (l) => l.value != null && l.currency && l.currency !== currency
  ).length

  const pipelineValue = open.reduce((sum, l) => sum + amountOf(l), 0)
  const wonValue = won.reduce((sum, l) => sum + amountOf(l), 0)

  const source = new Map<string, number>()
  const stage = new Map<string, { value: number; position: number }>()
  const byOwner = new Map<string, SalespersonRow>()

  for (const lead of leads) {
    const sourceLabel = lead.source?.trim() || "Not recorded"
    source.set(sourceLabel, (source.get(sourceLabel) ?? 0) + 1)

    const entry = stage.get(lead.stageName)
    if (entry) entry.value += 1
    else stage.set(lead.stageName, { value: 1, position: lead.stagePosition })

    // Unassigned is a real state and the one worth surfacing, so it gets a
    // row rather than being dropped from the table.
    const ownerId = lead.ownerId ?? "__unassigned"
    const row =
      byOwner.get(ownerId) ??
      ({
        id: ownerId,
        name: lead.ownerName ?? "Unassigned",
        taken: 0,
        won: 0,
        lost: 0,
        open: 0,
        wonValue: 0,
        conversionRate: 0,
      } satisfies SalespersonRow)

    row.taken += 1
    if (lead.stageType === "WON") {
      row.won += 1
      row.wonValue += amountOf(lead)
    } else if (lead.stageType === "LOST") row.lost += 1
    else row.open += 1

    byOwner.set(ownerId, row)
  }

  const months = monthsInRange(range)
  const monthly = new Map<string, { total: number; won: number }>()
  for (const lead of leads) {
    const key = `${lead.createdAt.getUTCFullYear()}-${String(lead.createdAt.getUTCMonth() + 1).padStart(2, "0")}`
    const entry = monthly.get(key) ?? { total: 0, won: 0 }
    entry.total += 1
    if (lead.stageType === "WON") entry.won += 1
    monthly.set(key, entry)
  }

  // The funnel narrows by definition: every won lead was qualified, and every
  // qualified lead was taken on. Built from nested subsets rather than from
  // four independent counts, so a step can never be wider than the one above.
  const byNewest = [...leads].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const steps = [
    { label: "Leads taken on", value: leads.length },
    { label: "Qualified", value: qualified },
    { label: "Won", value: won.length },
  ]
  const widest = steps[0].value || 1

  return {
    currency,
    total: leads.length,
    qualified,
    won: won.length,
    lost: lost.length,
    open: open.length,
    // Of every lead taken on - see the note at the top.
    conversionRate: leads.length > 0 ? (won.length / leads.length) * 100 : 0,
    previousTotal: previous.length,
    previousWon: previous.filter((l) => l.stageType === "WON").length,
    pipelineValue,
    wonValue,
    // Averaged over won deals, not over every lead: the average lead is worth
    // nothing, which is arithmetically true and commercially meaningless.
    averageDealValue: won.length > 0 ? wonValue / won.length : 0,
    stalled: open.filter((l) => !l.hasOpenTask).length,
    bySource: [...source.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    // Board order, not size order: a pipeline read out of sequence is not a
    // pipeline.
    byStage: [...stage.entries()]
      .sort((a, b) => a[1].position - b[1].position)
      .map(([label, entry]) => ({ label, value: entry.value })),
    trend: months.map((month) => {
      const entry = monthly.get(month.key) ?? { total: 0, won: 0 }
      return { label: month.label, total: entry.total, won: entry.won }
    }),
    funnel: steps.map((step) => ({ ...step, share: step.value / widest })),
    salespeople: [...byOwner.values()]
      .map((row) => ({
        ...row,
        conversionRate: row.taken > 0 ? (row.won / row.taken) * 100 : 0,
      }))
      .sort((a, b) => b.won - a.won || b.taken - a.taken),
    recent: byNewest.slice(0, 10),
    rows: byNewest,
    otherCurrencyCount,
  }
}
