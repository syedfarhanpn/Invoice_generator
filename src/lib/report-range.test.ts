import { describe, expect, it } from "vitest"

import {
  DEFAULT_RANGE,
  monthsInRange,
  parseRangeKey,
  resolveRange,
  withinRange,
} from "./report-range"

/** A Wednesday, mid-month, mid-quarter - nothing conveniently aligned. */
const NOW = new Date("2026-10-11T14:30:00Z")

const iso = (d: Date | null) => (d ? d.toISOString() : null)

describe("parseRangeKey", () => {
  it("accepts the keys it offers", () => {
    expect(parseRangeKey("thisMonth")).toBe("thisMonth")
    expect(parseRangeKey("custom")).toBe("custom")
  })

  it("falls back for anything else, including junk from the URL", () => {
    expect(parseRangeKey(undefined)).toBe(DEFAULT_RANGE)
    expect(parseRangeKey("")).toBe(DEFAULT_RANGE)
    expect(parseRangeKey("../../etc/passwd")).toBe(DEFAULT_RANGE)
    expect(parseRangeKey("LAST30")).toBe(DEFAULT_RANGE)
  })
})

describe("resolveRange", () => {
  it("ends a rolling range at the end of today, so today is included", () => {
    const range = resolveRange("last7", NOW)
    // Exclusive end, the midnight that starts tomorrow.
    expect(iso(range.to)).toBe("2026-10-12T00:00:00.000Z")
    expect(iso(range.from)).toBe("2026-10-05T00:00:00.000Z")
  })

  it("compares a rolling range against the window immediately before it", () => {
    const range = resolveRange("last30", NOW)
    expect(iso(range.previousTo)).toBe(iso(range.from))
    expect(range.previousTo!.getTime() - range.previousFrom!.getTime()).toBe(
      range.to.getTime() - range.from!.getTime()
    )
    expect(range.comparisonLabel).toBe("vs previous 30 days")
  })

  it("compares this month against the whole of last month, not an equal slice", () => {
    // On the 11th, "this month" is 11 days. Comparing it with 11 days of
    // September would answer a question nobody asked.
    const range = resolveRange("thisMonth", NOW)

    expect(iso(range.from)).toBe("2026-10-01T00:00:00.000Z")
    expect(iso(range.previousFrom)).toBe("2026-09-01T00:00:00.000Z")
    expect(iso(range.previousTo)).toBe("2026-10-01T00:00:00.000Z")
    expect(range.comparisonLabel).toBe("vs last month")
  })

  it("makes last month a whole calendar month", () => {
    const range = resolveRange("lastMonth", NOW)
    expect(iso(range.from)).toBe("2026-09-01T00:00:00.000Z")
    expect(iso(range.to)).toBe("2026-10-01T00:00:00.000Z")
  })

  it("starts this quarter on the right month", () => {
    // October is the start of Q4.
    expect(iso(resolveRange("thisQuarter", NOW).from)).toBe("2026-10-01T00:00:00.000Z")
    // Mid-quarter: August sits in Q3, which starts in July.
    expect(iso(resolveRange("thisQuarter", new Date("2026-08-20T00:00:00Z")).from)).toBe(
      "2026-07-01T00:00:00.000Z"
    )
  })

  it("handles the year boundary for the previous quarter", () => {
    const range = resolveRange("thisQuarter", new Date("2026-02-10T00:00:00Z"))
    expect(iso(range.from)).toBe("2026-01-01T00:00:00.000Z")
    expect(iso(range.previousFrom)).toBe("2025-10-01T00:00:00.000Z")
  })

  it("gives this year and last year whole-year bounds", () => {
    expect(iso(resolveRange("thisYear", NOW).from)).toBe("2026-01-01T00:00:00.000Z")

    const last = resolveRange("lastYear", NOW)
    expect(iso(last.from)).toBe("2025-01-01T00:00:00.000Z")
    expect(iso(last.to)).toBe("2026-01-01T00:00:00.000Z")
    expect(iso(last.previousFrom)).toBe("2024-01-01T00:00:00.000Z")
  })

  it("gives all time no start and nothing to compare against", () => {
    const range = resolveRange("all", NOW)
    expect(range.from).toBeNull()
    expect(range.previousFrom).toBeNull()
    expect(range.comparisonLabel).toBeNull()
  })

  it("reads a custom range from two days", () => {
    const range = resolveRange("custom", NOW, { from: "2026-03-01", to: "2026-03-31" })
    expect(iso(range.from)).toBe("2026-03-01T00:00:00.000Z")
    // Inclusive of the 31st, so the end is the 1st of April.
    expect(iso(range.to)).toBe("2026-04-01T00:00:00.000Z")
  })

  it("tolerates a custom range entered backwards", () => {
    const range = resolveRange("custom", NOW, { from: "2026-03-31", to: "2026-03-01" })
    expect(iso(range.from)).toBe("2026-03-01T00:00:00.000Z")
    expect(iso(range.to)).toBe("2026-04-01T00:00:00.000Z")
  })

  it("falls back rather than showing an empty report for a broken custom range", () => {
    // An empty report looks like a business with no records, which is worse
    // than quietly showing the default.
    expect(resolveRange("custom", NOW, { from: "nonsense", to: "2026-03-01" }).key).toBe(
      DEFAULT_RANGE
    )
    expect(resolveRange("custom", NOW, {}).key).toBe(DEFAULT_RANGE)
    expect(resolveRange("custom", NOW, { from: "2026-13-45", to: "2026-03-01" }).key).toBe(
      DEFAULT_RANGE
    )
  })

  it("covers a single day as a custom range", () => {
    const range = resolveRange("custom", NOW, { from: "2026-03-01", to: "2026-03-01" })
    expect(range.to.getTime() - range.from!.getTime()).toBe(86_400_000)
  })
})

describe("withinRange", () => {
  const range = resolveRange("custom", NOW, { from: "2026-03-01", to: "2026-03-31" })

  it("includes the first instant of the first day", () => {
    expect(withinRange(new Date("2026-03-01T00:00:00Z"), range)).toBe(true)
  })

  it("includes the last instant of the last day", () => {
    expect(withinRange(new Date("2026-03-31T23:59:59Z"), range)).toBe(true)
  })

  it("excludes the first instant of the next day", () => {
    // Half-open: a row must never fall in two adjacent periods.
    expect(withinRange(new Date("2026-04-01T00:00:00Z"), range)).toBe(false)
  })

  it("excludes anything before the start", () => {
    expect(withinRange(new Date("2026-02-28T23:59:59Z"), range)).toBe(false)
  })

  it("treats a range with no start as open-ended backwards", () => {
    const all = resolveRange("all", NOW)
    expect(withinRange(new Date("1999-01-01T00:00:00Z"), all)).toBe(true)
  })

  it("two adjacent ranges never both claim the same instant", () => {
    const march = resolveRange("custom", NOW, { from: "2026-03-01", to: "2026-03-31" })
    const april = resolveRange("custom", NOW, { from: "2026-04-01", to: "2026-04-30" })
    const boundary = new Date("2026-04-01T00:00:00Z")

    expect(withinRange(boundary, march)).toBe(false)
    expect(withinRange(boundary, april)).toBe(true)
  })
})

describe("monthsInRange", () => {
  it("lists each month a range spans, oldest first", () => {
    const range = resolveRange("custom", NOW, { from: "2026-01-15", to: "2026-04-02" })
    expect(monthsInRange(range).map((m) => m.label)).toEqual(["Jan", "Feb", "Mar", "Apr"])
  })

  it("returns one month for a range inside a single month", () => {
    const range = resolveRange("custom", NOW, { from: "2026-03-02", to: "2026-03-05" })
    expect(monthsInRange(range).map((m) => m.label)).toEqual(["Mar"])
  })

  it("falls back to recent months when a range has no start", () => {
    const months = monthsInRange(resolveRange("all", NOW), 6)
    expect(months).toHaveLength(6)
    expect(months[5].label).toBe("Oct")
    expect(months[0].label).toBe("May")
  })

  it("caps a very long range and keeps the most recent end", () => {
    const range = resolveRange("custom", NOW, { from: "2010-01-01", to: "2026-10-11" })
    const months = monthsInRange(range, 6, 24)

    expect(months).toHaveLength(24)
    expect(months[23].label).toBe("Oct")
  })

  it("gives each month a half-open span that meets the next exactly", () => {
    const months = monthsInRange(resolveRange("custom", NOW, { from: "2026-01-01", to: "2026-03-31" }))
    expect(iso(months[0].end)).toBe(iso(months[1].start))
    expect(iso(months[1].end)).toBe(iso(months[2].start))
  })
})
