/**
 * The date range a report covers, and the period it is compared against.
 *
 * Pure and UTC throughout, like the rest of the date handling: a report run on
 * the same data must give the same answer whoever runs it. The range is a
 * half-open interval [from, to) - the end is exclusive, so a day never lands
 * in two adjacent periods and a row is never counted twice when someone runs
 * January and then February.
 *
 * The comparison period is chosen to match the KIND of range, not just its
 * length. "This month" compares against last calendar month, because that is
 * the comparison a person means; "last 30 days" compares against the 30 days
 * before it, because there is no calendar unit to reach for. Using one rule
 * for both would make at least one of them answer a question nobody asked.
 */

export type RangeKey =
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "thisYear"
  | "lastYear"
  | "all"
  | "custom"

export type ReportRange = {
  key: RangeKey
  label: string
  /** Inclusive. Null only for "all", which has no start. */
  from: Date | null
  /** Exclusive. See the note above. */
  to: Date
  /** The equivalent earlier period, for "vs" figures. Null when there is
   *  nothing sensible to compare against. */
  previousFrom: Date | null
  previousTo: Date | null
  /** "vs last month", "vs previous 30 days". Null when previous is null. */
  comparisonLabel: string | null
}

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "last90", label: "Last 90 days" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "thisQuarter", label: "This quarter" },
  { key: "thisYear", label: "This year" },
  { key: "lastYear", label: "Last year" },
  { key: "all", label: "All time" },
]

export const DEFAULT_RANGE: RangeKey = "last30"

const DAY_MS = 86_400_000

function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

/** The day after `value`, so a range can include `value` itself. */
function endOfDayExclusive(value: Date): Date {
  return new Date(startOfDay(value).getTime() + DAY_MS)
}

function startOfMonth(value: Date, monthsBack = 0): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - monthsBack, 1))
}

function startOfQuarter(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), Math.floor(value.getUTCMonth() / 3) * 3, 1))
}

function startOfYear(value: Date, yearsBack = 0): Date {
  return new Date(Date.UTC(value.getUTCFullYear() - yearsBack, 0, 1))
}

/** A rolling window of `days` ending at the end of today. */
function rolling(now: Date, days: number): { from: Date; to: Date } {
  const to = endOfDayExclusive(now)
  return { from: new Date(to.getTime() - days * DAY_MS), to }
}

/** Narrows an untrusted ?range= value; anything unknown falls back. */
export function parseRangeKey(value: string | undefined): RangeKey {
  if (value === "custom") return "custom"
  const match = RANGE_OPTIONS.find((option) => option.key === value)
  return match ? match.key : DEFAULT_RANGE
}

/** A YYYY-MM-DD string from the query, or null if it is not one. */
function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function resolveRange(
  key: RangeKey,
  now = new Date(),
  custom?: { from?: string; to?: string }
): ReportRange {
  const label = RANGE_OPTIONS.find((o) => o.key === key)?.label ?? "Custom"

  /** An equal-length window immediately before `from`. */
  const precede = (from: Date, to: Date, comparison: string) => {
    const length = to.getTime() - from.getTime()
    return {
      previousFrom: new Date(from.getTime() - length),
      previousTo: from,
      comparisonLabel: comparison,
    }
  }

  switch (key) {
    case "last7": {
      const { from, to } = rolling(now, 7)
      return { key, label, from, to, ...precede(from, to, "vs previous 7 days") }
    }
    case "last30": {
      const { from, to } = rolling(now, 30)
      return { key, label, from, to, ...precede(from, to, "vs previous 30 days") }
    }
    case "last90": {
      const { from, to } = rolling(now, 90)
      return { key, label, from, to, ...precede(from, to, "vs previous 90 days") }
    }
    case "thisMonth": {
      const from = startOfMonth(now)
      const to = endOfDayExclusive(now)
      // Calendar-previous, not equal-length: on the 3rd of the month, "this
      // month" is three days long, and comparing it with the last three days
      // of the previous month would be a comparison nobody asked for.
      return {
        key,
        label,
        from,
        to,
        previousFrom: startOfMonth(now, 1),
        previousTo: from,
        comparisonLabel: "vs last month",
      }
    }
    case "lastMonth": {
      const from = startOfMonth(now, 1)
      const to = startOfMonth(now)
      return {
        key,
        label,
        from,
        to,
        previousFrom: startOfMonth(now, 2),
        previousTo: from,
        comparisonLabel: "vs the month before",
      }
    }
    case "thisQuarter": {
      const from = startOfQuarter(now)
      const to = endOfDayExclusive(now)
      const previousFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 3, 1))
      return {
        key,
        label,
        from,
        to,
        previousFrom,
        previousTo: from,
        comparisonLabel: "vs last quarter",
      }
    }
    case "thisYear": {
      const from = startOfYear(now)
      const to = endOfDayExclusive(now)
      return {
        key,
        label,
        from,
        to,
        previousFrom: startOfYear(now, 1),
        previousTo: from,
        comparisonLabel: "vs last year",
      }
    }
    case "lastYear": {
      const from = startOfYear(now, 1)
      const to = startOfYear(now)
      return {
        key,
        label,
        from,
        to,
        previousFrom: startOfYear(now, 2),
        previousTo: from,
        comparisonLabel: "vs the year before",
      }
    }
    case "all": {
      // No start, and nothing to compare against - "all time versus all time
      // before that" is empty by definition.
      return {
        key,
        label,
        from: null,
        to: endOfDayExclusive(now),
        previousFrom: null,
        previousTo: null,
        comparisonLabel: null,
      }
    }
    case "custom": {
      const parsedFrom = parseDay(custom?.from)
      const parsedTo = parseDay(custom?.to)
      // An unusable custom range falls back rather than showing nothing: a
      // mistyped URL should not produce an empty report that looks like a
      // business with no records.
      if (!parsedFrom || !parsedTo) return resolveRange(DEFAULT_RANGE, now)

      // Tolerate the two dates being the wrong way round rather than
      // returning an empty report for what is obviously a typo.
      const [lo, hi] =
        parsedFrom.getTime() <= parsedTo.getTime() ? [parsedFrom, parsedTo] : [parsedTo, parsedFrom]
      const to = endOfDayExclusive(hi)
      return {
        key,
        label: "Custom",
        from: lo,
        to,
        ...precede(lo, to, "vs the preceding period"),
      }
    }
  }
}

/** Whether an instant falls inside the range. Half-open, as above. */
export function withinRange(value: Date, range: { from: Date | null; to: Date }): boolean {
  if (range.from && value.getTime() < range.from.getTime()) return false
  return value.getTime() < range.to.getTime()
}

/**
 * The months a range spans, oldest first, for a trend chart.
 *
 * Capped, because "all time" on a long-running business would otherwise draw
 * a hundred unreadable columns. When the cap bites it keeps the most recent
 * months, which is the end anyone is looking at.
 */
export function monthsInRange(
  range: { from: Date | null; to: Date },
  fallbackMonths = 6,
  max = 24
): { key: string; label: string; start: Date; end: Date }[] {
  const end = new Date(range.to.getTime() - 1)
  const lastMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))

  const requested = range.from
    ? new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1))
    : new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() - (fallbackMonths - 1), 1))

  // Clamp the START, not the collected array. Collecting from the beginning
  // and slicing the tail sounds equivalent but is not: the loop has to stop
  // somewhere, so a sixteen-year range would stop twenty-four months in and
  // return 2010 to 2012 - the wrong end entirely, and plausible enough on a
  // chart that nobody would question it.
  const span =
    (lastMonth.getUTCFullYear() - requested.getUTCFullYear()) * 12 +
    (lastMonth.getUTCMonth() - requested.getUTCMonth()) +
    1
  const firstMonth =
    span > max
      ? new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth() - (max - 1), 1))
      : requested

  const months: { key: string; label: string; start: Date; end: Date }[] = []
  const cursor = new Date(firstMonth)
  while (cursor.getTime() <= lastMonth.getTime()) {
    const start = new Date(cursor)
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    months.push({
      key: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
      label: MONTH_LABEL.format(start),
      start,
      end: next,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return months
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })
