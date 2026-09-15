import { describe, expect, it } from "vitest"

import {
  type AnalyticsInvoice,
  buildSeries,
  DEFAULT_RANGE,
  dayKey,
  earliestRangeStart,
  niceAxisMax,
  parseRange,
  RANGES,
  rangeBounds,
} from "./analytics"

// A fixed "now" so none of this depends on the day the suite runs.
const NOW = new Date("2026-09-14T10:30:00.000Z")

const invoice = (o: Partial<AnalyticsInvoice> = {}): AnalyticsInvoice => ({
  issueDate: new Date("2026-09-10T00:00:00.000Z"),
  createdAt: new Date("2026-09-10T00:00:00.000Z"),
  totalAmount: 1000,
  amountPaid: 0,
  advanceReceived: 0,
  dueDate: new Date("2026-10-10T00:00:00.000Z"),
  currency: "INR",
  ...o,
})

describe("rangeBounds", () => {
  it("makes the 30-day window exactly 30 days, today included", () => {
    const { start, end } = rangeBounds("30d", NOW)
    expect(dayKey(start)).toBe("2026-08-16")
    expect(dayKey(end)).toBe("2026-09-14")
    expect(buildSeries([], "INR", "30d", NOW).days).toHaveLength(30)
  })

  it("runs the month window from the 1st to today", () => {
    const { start, end } = rangeBounds("month", NOW)
    expect(dayKey(start)).toBe("2026-09-01")
    expect(dayKey(end)).toBe("2026-09-14")
    expect(buildSeries([], "INR", "month", NOW).days).toHaveLength(14)
  })

  it("gives the month window a single day on the 1st", () => {
    const firstOfMonth = new Date("2026-09-01T09:00:00.000Z")
    expect(buildSeries([], "INR", "month", firstOfMonth).days).toHaveLength(1)
  })

  it("uses UTC boundaries, not the machine's zone", () => {
    // Late evening UTC is already tomorrow in Asia/Kolkata. The bucket must not
    // move with the server's timezone, or the server and browser would disagree.
    const lateUtc = new Date("2026-09-14T23:30:00.000Z")
    expect(dayKey(rangeBounds("30d", lateUtc).end)).toBe("2026-09-14")
  })

  it("reaches back far enough for either window in one query", () => {
    // Early in the month the 30-day window starts before the 1st; late in a long
    // month the month start is earlier. The query bound has to cover both.
    for (const now of [new Date("2026-09-01T00:00:00.000Z"), new Date("2026-01-31T00:00:00.000Z")]) {
      const earliest = earliestRangeStart(now)
      for (const { key } of RANGES) {
        expect(earliest.getTime()).toBeLessThanOrEqual(rangeBounds(key, now).start.getTime())
      }
    }
  })
})

describe("buildSeries", () => {
  it("splits an invoice into received, pending and overdue", () => {
    const series = buildSeries(
      [invoice({ totalAmount: 1000, amountPaid: 400 })],
      "INR",
      "30d",
      NOW
    )
    expect(series.totals).toMatchObject({
      receivedMinor: 40_000,
      pendingMinor: 60_000,
      overdueMinor: 0,
      invoicedMinor: 100_000,
      invoiceCount: 1,
    })
  })

  it("counts an unpaid balance past its due date as overdue, not pending", () => {
    const series = buildSeries(
      [invoice({ amountPaid: 400, dueDate: new Date("2026-09-01T00:00:00.000Z") })],
      "INR",
      "30d",
      NOW
    )
    expect(series.totals.overdueMinor).toBe(60_000)
    expect(series.totals.pendingMinor).toBe(0)
  })

  it("never counts a balance as both pending and overdue", () => {
    // The three segments stack to the invoiced total; double-counting would
    // make the bar taller than the money that was actually billed.
    const series = buildSeries(
      [
        invoice({ amountPaid: 400, dueDate: new Date("2026-09-01T00:00:00.000Z") }),
        invoice({ amountPaid: 250 }),
        invoice({ amountPaid: 1000 }),
      ],
      "INR",
      "30d",
      NOW
    )
    const { receivedMinor, pendingMinor, overdueMinor, invoicedMinor } = series.totals
    expect(receivedMinor + pendingMinor + overdueMinor).toBe(invoicedMinor)
  })

  it("counts an advance towards received", () => {
    const series = buildSeries(
      [invoice({ amountPaid: 600, advanceReceived: 400 })],
      "INR",
      "30d",
      NOW
    )
    expect(series.totals.receivedMinor).toBe(100_000)
    expect(series.totals.pendingMinor).toBe(0)
  })

  it("buckets by issue date", () => {
    const series = buildSeries(
      [
        invoice({ issueDate: new Date("2026-09-10T00:00:00.000Z"), amountPaid: 1000 }),
        invoice({ issueDate: new Date("2026-09-12T00:00:00.000Z"), amountPaid: 500 }),
      ],
      "INR",
      "30d",
      NOW
    )
    const byDate = Object.fromEntries(series.days.map((d) => [d.date, d.receivedMinor]))
    expect(byDate["2026-09-10"]).toBe(100_000)
    expect(byDate["2026-09-12"]).toBe(50_000)
    expect(byDate["2026-09-11"]).toBe(0)
  })

  it("falls back to the creation date when an invoice has no issue date", () => {
    const series = buildSeries(
      [
        invoice({
          issueDate: null,
          createdAt: new Date("2026-09-09T00:00:00.000Z"),
          amountPaid: 1000,
        }),
      ],
      "INR",
      "30d",
      NOW
    )
    expect(series.days.find((d) => d.date === "2026-09-09")?.receivedMinor).toBe(100_000)
  })

  it("drops invoices outside the window", () => {
    const series = buildSeries(
      [invoice({ issueDate: new Date("2026-07-01T00:00:00.000Z") })],
      "INR",
      "month",
      NOW
    )
    expect(series.totals.invoiceCount).toBe(0)
    expect(series.days.every((d) => d.receivedMinor + d.pendingMinor + d.overdueMinor === 0)).toBe(
      true
    )
  })

  it("returns a full, zeroed window for no invoices", () => {
    const series = buildSeries([], "INR", "30d", NOW)
    expect(series.days).toHaveLength(30)
    expect(series.totals.invoicedMinor).toBe(0)
  })
})

describe("parseRange", () => {
  it("accepts every declared range", () => {
    for (const { key } of RANGES) expect(parseRange(key)).toBe(key)
  })

  it("falls back to the default for anything unrecognised", () => {
    for (const bad of [undefined, null, "", "90d", "__proto__", 7]) {
      expect(parseRange(bad)).toBe(DEFAULT_RANGE)
    }
  })
})

describe("niceAxisMax", () => {
  it("snaps to a round number at or above the tallest bar", () => {
    expect(niceAxisMax(1)).toBe(1)
    expect(niceAxisMax(1_400)).toBe(2_000)
    expect(niceAxisMax(4_100)).toBe(5_000)
    expect(niceAxisMax(6_200)).toBe(10_000)
    expect(niceAxisMax(100_000)).toBe(100_000)
  })

  it("never returns something a bar could exceed", () => {
    for (const v of [1, 7, 99, 1234, 55_555, 987_654]) {
      expect(niceAxisMax(v)).toBeGreaterThanOrEqual(v)
    }
  })

  it("stays positive for an empty window, so the axis never divides by zero", () => {
    for (const v of [0, -1, NaN]) expect(niceAxisMax(v)).toBeGreaterThan(0)
  })
})
