import type { BillingCycle, SubscriptionKind, SubscriptionStatus } from "@prisma/client"

import { advanceByCycle } from "./renewals"

/**
 * When renewals actually fall, month by month.
 *
 * `renewsOn` holds only the NEXT date due, so counting rows by that column
 * would put a monthly host in one month of the year and leave the other
 * eleven empty. A renewal is a repeating event: this walks each row's cycle
 * out from the date it holds, forwards to the end of the window and backwards
 * to its start date, and counts every occurrence that lands inside.
 *
 * Pure and UTC throughout, for the same reason the rest of lib/renewals.ts
 * is: a renewal is a calendar date, not an instant.
 *
 * Only ACTIVE rows are projected. A cancelled contract has no future
 * occurrences to budget for, and drawing them would put work on the chart
 * that nobody is going to do.
 */

export type RenewalOccurrenceRow = {
  kind: SubscriptionKind
  status: SubscriptionStatus
  /** Nothing renewed before the day it began. */
  startsOn: Date
  /** The next date due. Earlier occurrences are stepped back from here. */
  renewsOn: Date
  cycle: BillingCycle
}

/** The four columns the chart and the tabs agree on. */
export type RenewalGroup = "amc" | "domain" | "hosting" | "other"

export const RENEWAL_GROUP_LABEL: Record<RenewalGroup, string> = {
  amc: "AMC",
  domain: "Domain",
  hosting: "Hosting",
  other: "Other",
}

/** Which column of the chart, and which tab of the table, a kind belongs to. */
export function groupOfKind(kind: SubscriptionKind): RenewalGroup {
  if (kind === "AMC") return "amc"
  if (kind === "DOMAIN") return "domain"
  if (kind === "HOSTING") return "hosting"
  return "other"
}

export type RenewalMonth = {
  label: string
  /** 0-11, so a caller can line a month up with a Date. */
  month: number
  amc: number
  domain: number
  hosting: number
  other: number
  total: number
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })

/** Midnight UTC on the day this instant falls in. */
function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

/**
 * Every date this row comes due between `from` and `to`, both inclusive.
 *
 * Bounded at 500 steps in each direction so a monthly cycle with a mistyped
 * date from 1970 cannot spin. That ceiling is far above any real window: a
 * decade of monthly renewals is 120.
 */
export function occurrencesBetween(
  row: RenewalOccurrenceRow,
  from: Date,
  to: Date
): Date[] {
  if (row.status !== "ACTIVE") return []

  const start = utcDay(from)
  const end = utcDay(to)
  const floor = Math.max(start, utcDay(row.startsOn))
  const found: Date[] = []

  // Backwards from renewsOn, down to whichever is later: the window's start
  // or the day the subscription began.
  let back = row.renewsOn
  for (let i = 0; i < 500 && utcDay(back) >= floor; i += 1) {
    if (utcDay(back) <= end) found.push(back)
    const previous = stepBack(back, row.cycle)
    // A cycle that does not move the date would loop forever.
    if (utcDay(previous) >= utcDay(back)) break
    back = previous
  }

  // Forwards from the step after renewsOn, up to the window's end.
  let forward = advanceByCycle(row.renewsOn, row.cycle)
  for (let i = 0; i < 500 && utcDay(forward) <= end; i += 1) {
    if (utcDay(forward) >= floor) found.push(forward)
    forward = advanceByCycle(forward, row.cycle)
  }

  return found.sort((a, b) => a.getTime() - b.getTime())
}

/**
 * One cycle before `from`.
 *
 * advanceByCycle in reverse, and it has to be written out rather than
 * negated: the month-end clamp is not symmetrical. Stepping 31 March back a
 * month must give 28 February, and stepping that forward again gives 28
 * March, not 31 - which is correct, because the anniversary a registrar
 * honours is the one on the contract, and we only ever hold one end of it.
 */
function stepBack(from: Date, cycle: BillingCycle): Date {
  const months = CYCLE_MONTHS[cycle]
  const month = from.getUTCMonth() - months
  const targetYear = from.getUTCFullYear() + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(from.getUTCDate(), lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  )
}

/** How many months one paid period covers. Mirrors lib/renewals.ts. */
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
  BIENNIAL: 24,
  TRIENNIAL: 36,
}

/** Twelve buckets for a calendar year, split by what kind of thing renews. */
export function renewalsByMonth(rows: RenewalOccurrenceRow[], year: number): RenewalMonth[] {
  const months: RenewalMonth[] = Array.from({ length: 12 }, (_, month) => ({
    label: MONTH_LABEL.format(new Date(Date.UTC(year, month, 1))),
    month,
    amc: 0,
    domain: 0,
    hosting: 0,
    other: 0,
    total: 0,
  }))

  const from = new Date(Date.UTC(year, 0, 1))
  const to = new Date(Date.UTC(year, 11, 31))

  for (const row of rows) {
    const group = groupOfKind(row.kind)
    for (const date of occurrencesBetween(row, from, to)) {
      const bucket = months[date.getUTCMonth()]
      bucket[group] += 1
      bucket.total += 1
    }
  }

  return months
}

/**
 * How many renewals fall in one calendar month.
 *
 * `offset` counts months back from the one `now` sits in, so 0 is this month
 * and 1 is last month - which is what the card's "vs last month" compares.
 */
export function dueInCalendarMonth(
  rows: RenewalOccurrenceRow[],
  offset = 0,
  now = new Date()
): number {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() - offset
  const from = new Date(Date.UTC(year, month, 1))
  const to = new Date(Date.UTC(year, month + 1, 0))

  let count = 0
  for (const row of rows) count += occurrencesBetween(row, from, to).length
  return count
}
