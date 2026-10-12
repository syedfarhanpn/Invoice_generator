import type { BillingCycle, SubscriptionKind, SubscriptionStatus } from "@prisma/client"

import {
  annualEquivalent,
  daysUntil,
  KIND_LABEL,
  urgencyOf,
  type RenewalUrgency,
} from "./renewals"

/**
 * The figures above a renewals screen.
 *
 * Pure, so the rules can be tested; the query lives in subscription-stats.ts.
 *
 * The discipline that matters here is that `cost` and `price` are opposite
 * directions of money and must never be summed together. A domain costs us
 * ₹900 and is billed to the client at ₹1,500; adding those gives ₹2,400,
 * which is neither what we spend nor what we earn. They are kept as two
 * figures throughout, and `margin` is the one derived number - so it cannot
 * disagree with its own parts.
 *
 * Margin is taken over RESOLD services only - the ones that belong to a
 * client. Our own domain costs money and bills nobody; counting it as margin
 * would report our own overhead as a loss-making resale, which is a different
 * and much more alarming claim than the true one.
 *
 * Only ACTIVE subscriptions count toward a commitment. A cancelled one still
 * appears in the list, because "we let this lapse in March" is worth seeing,
 * but it is not money anyone is going to spend.
 */

export type SubscriptionLike = {
  id: string
  kind: SubscriptionKind
  name: string
  status: SubscriptionStatus
  renewsOn: Date
  cycle: BillingCycle
  cost: number | null
  price: number | null
  currency: string
  autoRenew: boolean
  /** Null means it is ours, not a client's - which decides what margin means. */
  clientId: string | null
  clientName: string | null
}

export type UrgencyCount = { urgency: RenewalUrgency; count: number }

export type SubscriptionStats = {
  currency: string
  total: number
  activeCount: number
  cancelledCount: number
  /** What we pay out per year, across every active row. */
  annualCost: number
  /** The part of annualCost carried for a client, and so billable on. */
  annualCostResold: number
  /** The part that is our own infrastructure. The two add up to annualCost. */
  annualCostOwn: number
  /** What clients pay us per year, across active rows. */
  annualRevenue: number
  /** annualRevenue - annualCostResold. Our own overhead is not a loss on a
   *  resale, so it is deliberately excluded. Derived, never summed. */
  annualMargin: number
  overdueCount: number
  /** Due within the next 30 days and not already overdue. */
  dueSoonCount: number
  /** The money riding on those: whichever direction the caller cares about. */
  dueSoonCost: number
  dueSoonRevenue: number
  autoRenewCount: number
  byUrgency: UrgencyCount[]
  byKind: { label: string; value: number }[]
  /** Rows left out of the money figures because of their currency. */
  otherCurrencyCount: number
}

const URGENCY_ORDER: RenewalUrgency[] = ["overdue", "due", "soon", "upcoming", "later"]

export function summariseSubscriptions(
  rows: SubscriptionLike[],
  currency: string,
  now = new Date()
): SubscriptionStats {
  let activeCount = 0
  let cancelledCount = 0
  let annualCostResold = 0
  let annualCostOwn = 0
  let annualRevenue = 0
  let overdueCount = 0
  let dueSoonCount = 0
  let dueSoonCost = 0
  let dueSoonRevenue = 0
  let autoRenewCount = 0
  let otherCurrencyCount = 0

  const urgency = new Map<RenewalUrgency, number>()
  const kind = new Map<string, number>()

  for (const row of rows) {
    const active = row.status === "ACTIVE"
    if (active) activeCount += 1
    else cancelledCount += 1

    // Counts describe the list you are looking at, so every row is counted.
    // Only the money is currency-scoped.
    const band = urgencyOf(daysUntil(row.renewsOn, now))
    urgency.set(band, (urgency.get(band) ?? 0) + 1)
    kind.set(KIND_LABEL[row.kind], (kind.get(KIND_LABEL[row.kind]) ?? 0) + 1)

    // A cancelled subscription cannot be overdue for renewal - nobody is
    // going to renew it. Counting it would put a permanent red number on the
    // screen that no action can clear.
    if (active && band === "overdue") overdueCount += 1
    if (active && row.autoRenew) autoRenewCount += 1

    if (row.currency !== currency) {
      otherCurrencyCount += 1
      continue
    }
    if (!active) continue

    const cost = row.cost ?? 0
    const price = row.price ?? 0

    // Split at source, so the two halves cannot drift from their total.
    if (row.clientId) annualCostResold += annualEquivalent(cost, row.cycle)
    else annualCostOwn += annualEquivalent(cost, row.cycle)
    annualRevenue += annualEquivalent(price, row.cycle)

    if (band === "overdue" || band === "due" || band === "soon") {
      dueSoonCount += 1
      // The actual cycle amount, not an annualised one: this is the cheque
      // that has to be written when the date arrives.
      dueSoonCost += cost
      dueSoonRevenue += price
    }
  }

  return {
    currency,
    total: rows.length,
    activeCount,
    cancelledCount,
    annualCost: annualCostResold + annualCostOwn,
    annualCostResold,
    annualCostOwn,
    annualRevenue,
    // Over resold services only - our own overhead is not a loss on a resale.
    annualMargin: annualRevenue - annualCostResold,
    overdueCount,
    dueSoonCount,
    dueSoonCost,
    dueSoonRevenue,
    autoRenewCount,
    byUrgency: URGENCY_ORDER.map((u) => ({ urgency: u, count: urgency.get(u) ?? 0 })).filter(
      (u) => u.count > 0
    ),
    byKind: [...kind.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    otherCurrencyCount,
  }
}
