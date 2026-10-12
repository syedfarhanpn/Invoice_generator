import { describe, expect, it } from "vitest"

import {
  dueInCalendarMonth,
  groupOfKind,
  occurrencesBetween,
  renewalsByMonth,
  type RenewalOccurrenceRow,
} from "@/lib/renewal-calendar"

function row(overrides: Partial<RenewalOccurrenceRow> = {}): RenewalOccurrenceRow {
  return {
    kind: "DOMAIN",
    status: "ACTIVE",
    startsOn: new Date("2020-01-01T12:00:00Z"),
    renewsOn: new Date("2026-06-15T12:00:00Z"),
    cycle: "YEARLY",
    ...overrides,
  }
}

const iso = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 10))

describe("groupOfKind", () => {
  it("puts each kind in the column its tab shows", () => {
    expect(groupOfKind("AMC")).toBe("amc")
    expect(groupOfKind("DOMAIN")).toBe("domain")
    expect(groupOfKind("HOSTING")).toBe("hosting")
    expect(groupOfKind("SSL")).toBe("other")
    expect(groupOfKind("EMAIL")).toBe("other")
    expect(groupOfKind("OTHER")).toBe("other")
  })
})

describe("occurrencesBetween", () => {
  const JAN = new Date("2026-01-01T00:00:00Z")
  const DEC = new Date("2026-12-31T00:00:00Z")

  it("finds the single yearly occurrence inside the window", () => {
    expect(iso(occurrencesBetween(row(), JAN, DEC))).toEqual(["2026-06-15"])
  })

  it("walks a monthly cycle across the whole year", () => {
    const dates = occurrencesBetween(row({ cycle: "MONTHLY" }), JAN, DEC)
    expect(dates).toHaveLength(12)
    expect(iso(dates)[0]).toBe("2026-01-15")
    expect(iso(dates).at(-1)).toBe("2026-12-15")
  })

  it("steps backwards from renewsOn as well as forwards", () => {
    // renewsOn is the NEXT date due. The quarter before it already happened
    // and still belongs on the chart.
    const dates = occurrencesBetween(row({ cycle: "QUARTERLY" }), JAN, DEC)
    expect(iso(dates)).toEqual(["2026-03-15", "2026-06-15", "2026-09-15", "2026-12-15"])
  })

  it("never renews before the day it began", () => {
    const dates = occurrencesBetween(
      row({ cycle: "QUARTERLY", startsOn: new Date("2026-05-01T12:00:00Z") }),
      JAN,
      DEC
    )
    expect(iso(dates)).toEqual(["2026-06-15", "2026-09-15", "2026-12-15"])
  })

  it("leaves a cancelled row off the chart entirely", () => {
    expect(occurrencesBetween(row({ status: "CANCELLED" }), JAN, DEC)).toEqual([])
  })

  it("returns nothing when the cycle never lands in the window", () => {
    const dates = occurrencesBetween(
      row({ cycle: "TRIENNIAL", renewsOn: new Date("2028-06-15T12:00:00Z") }),
      JAN,
      DEC
    )
    expect(dates).toEqual([])
  })

  it("clamps a month-end date rather than skidding into the next month", () => {
    const dates = occurrencesBetween(
      row({ cycle: "MONTHLY", renewsOn: new Date("2026-03-31T12:00:00Z") }),
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-03-31T00:00:00Z")
    )
    // 28 February, not 2 or 3 March.
    expect(iso(dates)).toEqual(["2026-02-28", "2026-03-31"])
  })

  it("includes both ends of the window", () => {
    const dates = occurrencesBetween(
      row({ cycle: "MONTHLY", renewsOn: new Date("2026-01-01T12:00:00Z") }),
      JAN,
      new Date("2026-02-01T00:00:00Z")
    )
    expect(iso(dates)).toEqual(["2026-01-01", "2026-02-01"])
  })
})

describe("renewalsByMonth", () => {
  it("returns twelve labelled buckets even with nothing to show", () => {
    const months = renewalsByMonth([], 2026)
    expect(months).toHaveLength(12)
    expect(months.map((m) => m.label)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ])
    expect(months.every((m) => m.total === 0)).toBe(true)
  })

  it("files each row under its own column", () => {
    const months = renewalsByMonth(
      [
        row({ kind: "AMC", renewsOn: new Date("2026-04-10T12:00:00Z") }),
        row({ kind: "DOMAIN", renewsOn: new Date("2026-04-20T12:00:00Z") }),
        row({ kind: "HOSTING", renewsOn: new Date("2026-04-25T12:00:00Z") }),
        row({ kind: "SSL", renewsOn: new Date("2026-04-28T12:00:00Z") }),
      ],
      2026
    )
    const april = months[3]
    expect(april).toMatchObject({ amc: 1, domain: 1, hosting: 1, other: 1, total: 4 })
  })

  it("keeps the total equal to the sum of its columns", () => {
    const months = renewalsByMonth(
      [
        row({ kind: "AMC", cycle: "MONTHLY" }),
        row({ kind: "HOSTING", cycle: "QUARTERLY" }),
        row({ kind: "DOMAIN" }),
      ],
      2026
    )
    for (const m of months) {
      expect(m.total).toBe(m.amc + m.domain + m.hosting + m.other)
    }
  })

  it("spreads a monthly contract across every month rather than one", () => {
    const months = renewalsByMonth([row({ cycle: "MONTHLY" })], 2026)
    expect(months.every((m) => m.total === 1)).toBe(true)
  })
})

describe("dueInCalendarMonth", () => {
  const NOW = new Date("2026-06-15T10:00:00Z")

  it("counts what falls in the month `now` sits in", () => {
    const rows = [
      row({ renewsOn: new Date("2026-06-02T12:00:00Z") }),
      row({ renewsOn: new Date("2026-06-30T12:00:00Z") }),
      row({ renewsOn: new Date("2026-07-01T12:00:00Z") }),
    ]
    expect(dueInCalendarMonth(rows, 0, NOW)).toBe(2)
  })

  it("counts last month when asked for the previous one", () => {
    const rows = [
      row({ renewsOn: new Date("2026-06-02T12:00:00Z"), cycle: "MONTHLY" }),
      row({ renewsOn: new Date("2026-09-09T12:00:00Z") }),
    ]
    // The monthly row renewed in May too; the yearly one did not.
    expect(dueInCalendarMonth(rows, 1, NOW)).toBe(1)
  })

  it("crosses a year boundary when stepping back from January", () => {
    const rows = [row({ renewsOn: new Date("2025-12-20T12:00:00Z") })]
    expect(dueInCalendarMonth(rows, 1, new Date("2026-01-10T00:00:00Z"))).toBe(1)
  })

  it("ignores cancelled rows", () => {
    const rows = [row({ status: "CANCELLED", renewsOn: new Date("2026-06-02T12:00:00Z") })]
    expect(dueInCalendarMonth(rows, 0, NOW)).toBe(0)
  })
})
