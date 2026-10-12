import type { BillingCycle, SubscriptionKind } from "@prisma/client"

/**
 * Renewal arithmetic.
 *
 * Pure, and UTC throughout, for the same reason document dates are: a renewal
 * is a calendar date, not an instant. If the server reads it in one zone and
 * the browser in another, a domain expiring "today" becomes "yesterday" for
 * five and a half hours every day.
 *
 * Nothing here is stored. Whether something is overdue, due this week or fine
 * for another year is `renewsOn` against now - a column holding that would be
 * wrong the moment nobody opened the page.
 */

/** How many months one paid period covers. */
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
  BIENNIAL: 24,
  TRIENNIAL: 36,
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  YEARLY: "Yearly",
  BIENNIAL: "Every 2 years",
  TRIENNIAL: "Every 3 years",
}

export const KIND_LABEL: Record<SubscriptionKind, string> = {
  AMC: "AMC",
  DOMAIN: "Domain",
  HOSTING: "Hosting",
  SSL: "SSL certificate",
  EMAIL: "Email",
  OTHER: "Other",
}

/**
 * Which permission governs each kind. One table, one screen, two modules.
 *
 * AMCs are contracts sold to clients and infrastructure is bought from
 * suppliers, and a workspace can reasonably let someone manage one without
 * the other. Merging the two pages into one set of tabs did not merge the
 * permissions: the row's kind is still what decides, which is why this lives
 * here rather than being inferred from whichever page made the request.
 */
export const RENEWAL_KINDS: SubscriptionKind[] = ["AMC", "OTHER"]
export const INFRASTRUCTURE_KINDS: SubscriptionKind[] = ["DOMAIN", "HOSTING", "SSL", "EMAIL"]

export const ALL_SUBSCRIPTION_KINDS: SubscriptionKind[] = [
  ...RENEWAL_KINDS,
  ...INFRASTRUCTURE_KINDS,
]

export function moduleForKind(kind: SubscriptionKind): "renewals" | "domains" {
  return INFRASTRUCTURE_KINDS.includes(kind) ? "domains" : "renewals"
}

const DAY_MS = 86_400_000

/** Midnight UTC on the day this instant falls in. */
function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

/**
 * Whole days from today until a renewal. Negative once it has passed, 0 on
 * the day itself.
 *
 * Both ends are floored to a UTC day first, so this counts calendar days
 * rather than 24-hour periods - "tomorrow" is 1 whether it is now 9am or 11pm.
 */
export function daysUntil(renewsOn: Date, now = new Date()): number {
  return Math.round((startOfUtcDay(renewsOn) - startOfUtcDay(now)) / DAY_MS)
}

/**
 * The last day of a month, so adding a month to the 31st does not skid into
 * the following one. JS `setUTCMonth(0 + 1)` on 31 January gives 2 or 3 March;
 * a domain registered on the 31st renews on the 31st, or on the last day of a
 * month that has no 31st.
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** The date one cycle after `from`. */
export function advanceByCycle(from: Date, cycle: BillingCycle): Date {
  const months = CYCLE_MONTHS[cycle]
  const year = from.getUTCFullYear()
  const month = from.getUTCMonth() + months
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const day = Math.min(from.getUTCDate(), lastDayOfMonth(targetYear, targetMonth))

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  )
}

/**
 * The next renewal date at or after `now`, rolling forward by whole cycles.
 *
 * Used when something lapsed unnoticed: rather than showing a date two years
 * gone, the renewal view can say when it would next come round. Bounded so a
 * mistyped date from 1970 cannot spin.
 */
export function nextOccurrence(renewsOn: Date, cycle: BillingCycle, now = new Date()): Date {
  let next = renewsOn
  for (let i = 0; i < 200 && startOfUtcDay(next) < startOfUtcDay(now); i += 1) {
    next = advanceByCycle(next, cycle)
  }
  return next
}

export type RenewalUrgency = "overdue" | "due" | "soon" | "upcoming" | "later"

/** Days-remaining thresholds. Exported so the UI legend cannot drift. */
export const URGENCY_DAYS = { due: 7, soon: 30, upcoming: 90 } as const

export function urgencyOf(days: number): RenewalUrgency {
  if (days < 0) return "overdue"
  if (days <= URGENCY_DAYS.due) return "due"
  if (days <= URGENCY_DAYS.soon) return "soon"
  if (days <= URGENCY_DAYS.upcoming) return "upcoming"
  return "later"
}

export const URGENCY_LABEL: Record<RenewalUrgency, string> = {
  overdue: "Overdue",
  due: "This week",
  soon: "This month",
  upcoming: "Next 90 days",
  later: "Later",
}

/**
 * How a renewal reads in a sentence.
 *
 * "Expired 3 days ago" and "in 3 days" are different enough that rendering
 * both from one signed number at each call site invites a missing minus sign.
 */
export function describeRenewal(days: number): string {
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days === -1) return "Yesterday"
  if (days < 0) return `${Math.abs(days)} days ago`
  return `In ${days} days`
}

/**
 * A cycle cost expressed per month, so a yearly domain and a monthly host can
 * be added together honestly.
 */
export function monthlyEquivalent(amount: number, cycle: BillingCycle): number {
  return amount / CYCLE_MONTHS[cycle]
}

/** A cycle cost expressed per year, which is how renewals are usually budgeted. */
export function annualEquivalent(amount: number, cycle: BillingCycle): number {
  return (amount * 12) / CYCLE_MONTHS[cycle]
}
