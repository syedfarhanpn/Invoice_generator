import { describe, expect, it } from "vitest"

import {
  advanceByCycle,
  annualEquivalent,
  daysUntil,
  describeRenewal,
  monthlyEquivalent,
  nextOccurrence,
  urgencyOf,
} from "./renewals"

const d = (iso: string) => new Date(iso)

describe("daysUntil", () => {
  it("counts calendar days, not 24-hour periods", () => {
    // 11pm today to 1am tomorrow is two hours, but it is still "tomorrow".
    expect(daysUntil(d("2026-10-12T01:00:00Z"), d("2026-10-11T23:00:00Z"))).toBe(1)
  })

  it("is zero on the day itself, whatever the time", () => {
    expect(daysUntil(d("2026-10-11T00:00:00Z"), d("2026-10-11T23:59:00Z"))).toBe(0)
    expect(daysUntil(d("2026-10-11T23:59:00Z"), d("2026-10-11T00:00:00Z"))).toBe(0)
  })

  it("goes negative once the date has passed", () => {
    expect(daysUntil(d("2026-10-08T00:00:00Z"), d("2026-10-11T00:00:00Z"))).toBe(-3)
  })

  it("counts across a month boundary", () => {
    expect(daysUntil(d("2026-11-01T00:00:00Z"), d("2026-10-30T00:00:00Z"))).toBe(2)
  })
})

describe("advanceByCycle", () => {
  it("adds a year", () => {
    expect(advanceByCycle(d("2026-03-15T00:00:00Z"), "YEARLY").toISOString()).toBe(
      "2027-03-15T00:00:00.000Z"
    )
  })

  it("does not skid past February when adding a month to the 31st", () => {
    // setUTCMonth would give 2 or 3 March here.
    expect(advanceByCycle(d("2026-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    )
  })

  it("lands on 29 February in a leap year", () => {
    expect(advanceByCycle(d("2028-01-31T00:00:00Z"), "MONTHLY").toISOString()).toBe(
      "2028-02-29T00:00:00.000Z"
    )
  })

  it("keeps the 31st when the target month has one", () => {
    expect(advanceByCycle(d("2026-01-31T00:00:00Z"), "QUARTERLY").toISOString()).toBe(
      "2026-04-30T00:00:00.000Z"
    )
    expect(advanceByCycle(d("2026-03-31T00:00:00Z"), "MONTHLY").toISOString()).toBe(
      "2026-04-30T00:00:00.000Z"
    )
    expect(advanceByCycle(d("2026-05-31T00:00:00Z"), "BIENNIAL").toISOString()).toBe(
      "2028-05-31T00:00:00.000Z"
    )
  })

  it("rolls the year over for the long cycles", () => {
    expect(advanceByCycle(d("2026-11-10T00:00:00Z"), "QUARTERLY").toISOString()).toBe(
      "2027-02-10T00:00:00.000Z"
    )
    expect(advanceByCycle(d("2026-06-01T00:00:00Z"), "TRIENNIAL").toISOString()).toBe(
      "2029-06-01T00:00:00.000Z"
    )
    expect(advanceByCycle(d("2026-08-01T00:00:00Z"), "HALF_YEARLY").toISOString()).toBe(
      "2027-02-01T00:00:00.000Z"
    )
  })
})

describe("nextOccurrence", () => {
  it("leaves a future date alone", () => {
    const future = d("2027-01-01T00:00:00Z")
    expect(nextOccurrence(future, "YEARLY", d("2026-10-11T00:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z"
    )
  })

  it("keeps today, rather than rolling past it", () => {
    expect(nextOccurrence(d("2026-10-11T00:00:00Z"), "YEARLY", d("2026-10-11T18:00:00Z")).toISOString()).toBe(
      "2026-10-11T00:00:00.000Z"
    )
  })

  it("rolls a long-lapsed renewal forward by whole cycles", () => {
    // Monthly, two and a bit years stale.
    expect(nextOccurrence(d("2024-05-10T00:00:00Z"), "MONTHLY", d("2026-10-11T00:00:00Z")).toISOString()).toBe(
      "2026-11-10T00:00:00.000Z"
    )
  })

  it("terminates on an absurd date instead of spinning", () => {
    const result = nextOccurrence(d("1970-01-01T00:00:00Z"), "MONTHLY", d("2026-10-11T00:00:00Z"))
    expect(result.getTime()).toBeGreaterThan(d("1970-01-01T00:00:00Z").getTime())
  })
})

describe("urgencyOf", () => {
  it("sorts days remaining into the bands the UI legend names", () => {
    expect(urgencyOf(-1)).toBe("overdue")
    expect(urgencyOf(0)).toBe("due")
    expect(urgencyOf(7)).toBe("due")
    expect(urgencyOf(8)).toBe("soon")
    expect(urgencyOf(30)).toBe("soon")
    expect(urgencyOf(31)).toBe("upcoming")
    expect(urgencyOf(90)).toBe("upcoming")
    expect(urgencyOf(91)).toBe("later")
  })

  it("treats the day itself as due, not overdue", () => {
    // A domain expiring today has not expired yet.
    expect(urgencyOf(0)).toBe("due")
  })
})

describe("describeRenewal", () => {
  it("reads naturally in both directions", () => {
    expect(describeRenewal(0)).toBe("Today")
    expect(describeRenewal(1)).toBe("Tomorrow")
    expect(describeRenewal(-1)).toBe("Yesterday")
    expect(describeRenewal(12)).toBe("In 12 days")
    expect(describeRenewal(-12)).toBe("12 days ago")
  })
})

describe("cycle equivalents", () => {
  it("puts every cycle on one scale so they can be added up", () => {
    expect(monthlyEquivalent(1200, "YEARLY")).toBe(100)
    expect(monthlyEquivalent(300, "QUARTERLY")).toBe(100)
    expect(monthlyEquivalent(100, "MONTHLY")).toBe(100)
    expect(monthlyEquivalent(2400, "BIENNIAL")).toBe(100)
    expect(monthlyEquivalent(3600, "TRIENNIAL")).toBe(100)
    expect(monthlyEquivalent(600, "HALF_YEARLY")).toBe(100)
  })

  it("annualises the same way", () => {
    expect(annualEquivalent(1200, "YEARLY")).toBe(1200)
    expect(annualEquivalent(100, "MONTHLY")).toBe(1200)
    // A three-year registration costs a third of itself per year.
    expect(annualEquivalent(3600, "TRIENNIAL")).toBe(1200)
  })
})
