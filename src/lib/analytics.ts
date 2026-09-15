import { currencyDecimals } from "./currencies"
import { paymentSummary } from "./money"

/**
 * Period analytics for the dashboard: of the invoices issued in a window, how
 * much has been received, how much is still pending, and how much is overdue.
 *
 * Buckets are keyed by issue date in UTC. Two reasons it is not local time:
 * document dates are stored at midnight UTC (see src/lib/dates.ts), and the
 * buckets are built on the server and rendered on the client, so anything that
 * depends on the machine's zone would put the two out of step.
 *
 * Received / pending / overdue are evaluated as they stand *now* - an invoice
 * issued three weeks ago that is still unpaid and past due counts as overdue in
 * its own issue-date bucket. The question the dashboard answers is "what came of
 * the work I billed in this period", not "what did the ledger look like then".
 */

export type RangeKey = "30d" | "month"

export const RANGES: { key: RangeKey; label: string; hint: string }[] = [
  { key: "30d", label: "Last 30 days", hint: "Rolling window ending today" },
  { key: "month", label: "This month", hint: "1st of the month to today" },
]

export const DEFAULT_RANGE: RangeKey = "30d"

export function parseRange(value: unknown): RangeKey {
  return RANGES.some((r) => r.key === value) ? (value as RangeKey) : DEFAULT_RANGE
}

/** One day of the window. Amounts are integer minor units. */
export type DayBucket = {
  /** YYYY-MM-DD, UTC. Stable across server and client. */
  date: string
  receivedMinor: number
  pendingMinor: number
  overdueMinor: number
}

export type RangeTotals = {
  receivedMinor: number
  pendingMinor: number
  overdueMinor: number
  invoicedMinor: number
  invoiceCount: number
}

export type RangeSeries = {
  key: RangeKey
  label: string
  /** Inclusive UTC day keys bounding the window. */
  startDate: string
  endDate: string
  days: DayBucket[]
  totals: RangeTotals
}

/** The shape this module needs off a Document row. */
export type AnalyticsInvoice = {
  issueDate: Date | null
  createdAt: Date
  totalAmount: number | null
  amountPaid: number
  advanceReceived: number
  dueDate: Date | null
  currency: string
}

const DAY_MS = 86_400_000

/** YYYY-MM-DD in UTC. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function utcStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Inclusive day bounds for a window, in UTC.
 *
 * "30d" is a rolling 30-day window *including today* - 29 days back, not 30, or
 * the window would be 31 days long.
 */
export function rangeBounds(key: RangeKey, now: Date): { start: Date; end: Date } {
  const end = utcStartOfDay(now)
  if (key === "month") {
    return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end }
  }
  return { start: new Date(end.getTime() - 29 * DAY_MS), end }
}

/** Every UTC day key from start to end, inclusive. */
function dayKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = []
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    keys.push(dayKey(new Date(t)))
  }
  return keys
}

/**
 * The earliest instant either window can reach, so one query can serve both and
 * the range switch costs no round trip.
 */
export function earliestRangeStart(now: Date): Date {
  return RANGES.map((r) => rangeBounds(r.key, now).start).reduce((a, b) => (a < b ? a : b))
}

export function buildSeries(
  invoices: AnalyticsInvoice[],
  currency: string,
  key: RangeKey,
  now: Date
): RangeSeries {
  const { start, end } = rangeBounds(key, now)
  const buckets = new Map<string, DayBucket>()
  for (const date of dayKeysBetween(start, end)) {
    buckets.set(date, { date, receivedMinor: 0, pendingMinor: 0, overdueMinor: 0 })
  }

  const totals: RangeTotals = {
    receivedMinor: 0,
    pendingMinor: 0,
    overdueMinor: 0,
    invoicedMinor: 0,
    invoiceCount: 0,
  }

  for (const invoice of invoices) {
    // An invoice with no issue date has not been dated by the user yet; its
    // creation day is the only honest stand-in.
    const issued = invoice.issueDate ?? invoice.createdAt
    const bucket = buckets.get(dayKey(issued))
    if (!bucket) continue

    const summary = paymentSummary(
      invoice.totalAmount,
      invoice.amountPaid,
      invoice.dueDate,
      false,
      currency,
      invoice.advanceReceived
    )

    // The balance is either overdue or merely pending - never both, or the
    // stack would double-count it against the invoiced total.
    const overdueMinor = summary.isOverdue ? summary.balanceMinor : 0
    const pendingMinor = summary.isOverdue ? 0 : summary.balanceMinor

    bucket.receivedMinor += summary.paidMinor
    bucket.pendingMinor += pendingMinor
    bucket.overdueMinor += overdueMinor

    totals.receivedMinor += summary.paidMinor
    totals.pendingMinor += pendingMinor
    totals.overdueMinor += overdueMinor
    totals.invoicedMinor += summary.totalMinor
    totals.invoiceCount += 1
  }

  return {
    key,
    label: RANGES.find((r) => r.key === key)!.label,
    startDate: dayKey(start),
    endDate: dayKey(end),
    days: [...buckets.values()],
    totals,
  }
}

/** Minor units back to a major-unit number for formatMoney. */
export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** currencyDecimals(currency)
}

/**
 * A round number at or above `maxMinor`, for the top of the y-axis.
 *
 * Ticks have to land on values a reader recognises (0 / 5,000 / 10,000), so the
 * axis is snapped to 1, 2 or 5 times a power of ten rather than to the tallest
 * bar. Returns a positive value even for an empty window, so the chart still
 * draws an axis instead of dividing by zero.
 */
export function niceAxisMax(maxMinor: number): number {
  if (!(maxMinor > 0)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(maxMinor))
  const normalized = maxMinor / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}
