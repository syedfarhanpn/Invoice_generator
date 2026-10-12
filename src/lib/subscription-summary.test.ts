import { describe, expect, it } from "vitest"

import { summariseSubscriptions, type SubscriptionLike } from "./subscription-summary"

/**
 * The invariant: cost and price are opposite directions of money and are never
 * summed together. Margin is derived from the two, so it cannot disagree.
 */

const NOW = new Date("2026-10-11T12:00:00Z")

function sub(partial: Partial<SubscriptionLike> = {}): SubscriptionLike {
  return {
    id: "s1",
    kind: "DOMAIN",
    name: "example.com",
    status: "ACTIVE",
    renewsOn: new Date("2027-01-01T00:00:00Z"),
    cycle: "YEARLY",
    cost: 900,
    price: 1500,
    currency: "INR",
    autoRenew: false,
    clientId: "c1",
    clientName: "Voiture",
    ...partial,
  }
}

describe("summariseSubscriptions", () => {
  it("keeps money out and money in as separate figures", () => {
    const stats = summariseSubscriptions([sub({ cost: 900, price: 1500 })], "INR", NOW)

    expect(stats.annualCost).toBe(900)
    expect(stats.annualRevenue).toBe(1500)
    // Never 2,400, which is neither what we spend nor what we earn.
    expect(stats.annualMargin).toBe(600)
  })

  it("keeps our own infrastructure out of the resale margin", () => {
    // Our own domain costs money and bills nobody. Counting it as margin
    // would report overhead as a loss-making resale.
    const stats = summariseSubscriptions(
      [
        sub({ id: "ours", clientId: null, clientName: null, cost: 1400, price: null }),
        sub({ id: "theirs", cost: 900, price: 1500 }),
      ],
      "INR",
      NOW
    )

    expect(stats.annualCostOwn).toBe(1400)
    expect(stats.annualCostResold).toBe(900)
    // Still the whole bill, for the "costs per year" figure.
    expect(stats.annualCost).toBe(2300)
    // 1500 - 900, not 1500 - 2300.
    expect(stats.annualMargin).toBe(600)
  })

  it("splits cost into two halves that add back up to the whole", () => {
    const stats = summariseSubscriptions(
      [
        sub({ id: "a", clientId: null, clientName: null, cost: 1000, price: null }),
        sub({ id: "b", cost: 2000, price: 3000 }),
        sub({ id: "c", cost: 500, price: 0 }),
      ],
      "INR",
      NOW
    )

    expect(stats.annualCostOwn + stats.annualCostResold).toBe(stats.annualCost)
  })

  it("reports a genuine loss on a resale that is billed under cost", () => {
    const stats = summariseSubscriptions([sub({ cost: 2000, price: 1500 })], "INR", NOW)

    expect(stats.annualMargin).toBe(-500)
  })

  it("derives margin from its own parts", () => {
    const stats = summariseSubscriptions(
      [
        sub({ id: "a", cost: 900, price: 1500 }),
        sub({ id: "b", cost: 6000, price: 0, cycle: "MONTHLY" }),
      ],
      "INR",
      NOW
    )

    expect(stats.annualMargin).toBe(stats.annualRevenue - stats.annualCostResold)
  })

  it("annualises every cycle onto one scale before adding", () => {
    const stats = summariseSubscriptions(
      [
        sub({ id: "a", cost: 100, price: 0, cycle: "MONTHLY" }),
        sub({ id: "b", cost: 1200, price: 0, cycle: "YEARLY" }),
        sub({ id: "c", cost: 3600, price: 0, cycle: "TRIENNIAL" }),
      ],
      "INR",
      NOW
    )

    expect(stats.annualCost).toBe(3600)
  })

  it("leaves a cancelled subscription out of the commitment but keeps it in the list", () => {
    const stats = summariseSubscriptions(
      [sub({ id: "a" }), sub({ id: "b", status: "CANCELLED", cost: 50_000, price: 90_000 })],
      "INR",
      NOW
    )

    expect(stats.total).toBe(2)
    expect(stats.activeCount).toBe(1)
    expect(stats.cancelledCount).toBe(1)
    expect(stats.annualCost).toBe(900)
    expect(stats.annualRevenue).toBe(1500)
  })

  it("does not call a cancelled subscription overdue", () => {
    // Nothing anyone does can clear this; a red number for it never goes away.
    const stats = summariseSubscriptions(
      [sub({ status: "CANCELLED", renewsOn: new Date("2026-01-01T00:00:00Z") })],
      "INR",
      NOW
    )

    expect(stats.overdueCount).toBe(0)
    expect(stats.byUrgency.find((u) => u.urgency === "overdue")?.count).toBe(1)
  })

  it("counts an active lapsed renewal as overdue", () => {
    const stats = summariseSubscriptions(
      [sub({ renewsOn: new Date("2026-09-01T00:00:00Z") })],
      "INR",
      NOW
    )

    expect(stats.overdueCount).toBe(1)
  })

  it("totals the cheque due soon at its cycle amount, not annualised", () => {
    const stats = summariseSubscriptions(
      [
        // Due in 10 days, billed every 3 years at 3,600.
        sub({ renewsOn: new Date("2026-10-21T00:00:00Z"), cycle: "TRIENNIAL", cost: 3600, price: 0 }),
      ],
      "INR",
      NOW
    )

    // 3,600 is what has to be paid on the day. 1,200 is its annual share.
    expect(stats.dueSoonCost).toBe(3600)
    expect(stats.annualCost).toBe(1200)
  })

  it("counts something renewing today as due, not overdue", () => {
    const stats = summariseSubscriptions(
      [sub({ renewsOn: new Date("2026-10-11T00:00:00Z") })],
      "INR",
      NOW
    )

    expect(stats.overdueCount).toBe(0)
    expect(stats.dueSoonCount).toBe(1)
  })

  it("excludes another currency from the money but still lists it", () => {
    const stats = summariseSubscriptions(
      [sub({ id: "a" }), sub({ id: "b", currency: "USD", cost: 12, price: 20 })],
      "INR",
      NOW
    )

    expect(stats.total).toBe(2)
    expect(stats.annualCost).toBe(900)
    expect(stats.otherCurrencyCount).toBe(1)
  })

  it("treats a missing cost or price as nothing rather than skipping the row", () => {
    const stats = summariseSubscriptions(
      [sub({ cost: null, price: 24_000, kind: "AMC" })],
      "INR",
      NOW
    )

    expect(stats.annualCost).toBe(0)
    expect(stats.annualRevenue).toBe(24_000)
    expect(stats.annualMargin).toBe(24_000)
    expect(stats.activeCount).toBe(1)
  })

  it("counts auto-renewing actives, which need budget rather than action", () => {
    const stats = summariseSubscriptions(
      [
        sub({ id: "a", autoRenew: true }),
        sub({ id: "b", autoRenew: false }),
        sub({ id: "c", autoRenew: true, status: "CANCELLED" }),
      ],
      "INR",
      NOW
    )

    expect(stats.autoRenewCount).toBe(1)
  })

  it("orders the urgency bands most urgent first and drops empty ones", () => {
    const stats = summariseSubscriptions(
      [
        sub({ id: "a", renewsOn: new Date("2026-09-01T00:00:00Z") }), // overdue
        sub({ id: "b", renewsOn: new Date("2026-10-14T00:00:00Z") }), // this week
        sub({ id: "c", renewsOn: new Date("2028-01-01T00:00:00Z") }), // later
      ],
      "INR",
      NOW
    )

    expect(stats.byUrgency.map((u) => u.urgency)).toEqual(["overdue", "due", "later"])
  })

  it("survives an empty list", () => {
    const stats = summariseSubscriptions([], "INR", NOW)

    expect(stats.total).toBe(0)
    expect(stats.annualCost).toBe(0)
    expect(stats.annualMargin).toBe(0)
    expect(stats.byUrgency).toEqual([])
    expect(stats.byKind).toEqual([])
  })
})
