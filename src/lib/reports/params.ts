import { formatDocumentDate } from "@/lib/dates"
import { parseRangeKey, resolveRange, type ReportRange } from "@/lib/report-range"

/** What every report page reads out of the URL. */
export type ReportSearchParams = {
  range?: string
  from?: string
  to?: string
}

export function rangeFromParams(params: ReportSearchParams, now = new Date()): ReportRange {
  return resolveRange(parseRangeKey(params.range), now, { from: params.from, to: params.to })
}

/**
 * The period in words, shown beside the picker.
 *
 * Spelled out rather than left implicit, because "Last 30 days" alone does not
 * say which thirty - and a report read a week later, or sent to someone else,
 * has to carry its own dates.
 */
export function describeRange(range: ReportRange): string {
  // The stored end is exclusive; the day a reader means is the one before it.
  const lastDay = new Date(range.to.getTime() - 1)
  if (!range.from) return `Everything up to ${formatDocumentDate(lastDay)}`

  const days = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000)
  return `${formatDocumentDate(range.from)} to ${formatDocumentDate(lastDay)} · ${days} day${days === 1 ? "" : "s"}`
}
