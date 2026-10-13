import { describe, expect, it } from "vitest"

import { nextResetLabel, weekResetAt, withinCurrentWeek } from "@/lib/week-reset"

/**
 * IST is UTC+5:30, so midnight IST on a Sunday is 18:30 UTC on the Saturday
 * before it. Every expectation here is written in UTC and the comment says
 * what it is in IST, because getting those two confused is the whole risk.
 */
describe("weekResetAt", () => {
  it("walks back to the most recent Sunday from midweek", () => {
    // Wed 14 Oct 2026, 10:00 UTC = 15:30 IST.
    const reset = weekResetAt(new Date("2026-10-14T10:00:00Z"))
    // Sun 11 Oct 00:00 IST.
    expect(reset.toISOString()).toBe("2026-10-10T18:30:00.000Z")
  })

  it("clears at the START of Sunday, not the end of it", () => {
    // Sun 11 Oct, 02:00 IST (= Sat 10 Oct 20:30 UTC).
    const reset = weekResetAt(new Date("2026-10-10T20:30:00Z"))
    expect(reset.toISOString()).toBe("2026-10-10T18:30:00.000Z")
  })

  it("still belongs to last week just before midnight IST on Saturday", () => {
    // Sat 10 Oct, 23:00 IST (= 17:30 UTC) - the reset has not happened yet.
    const reset = weekResetAt(new Date("2026-10-10T17:30:00Z"))
    // Sun 4 Oct 00:00 IST.
    expect(reset.toISOString()).toBe("2026-10-03T18:30:00.000Z")
  })

  it("does not use UTC Sunday, which would be 05:30 IST", () => {
    // Sun 11 Oct, 03:00 IST (= Sat 10 Oct 21:30 UTC). A UTC-based cutoff
    // would still be on Saturday here and keep the old cards.
    const reset = weekResetAt(new Date("2026-10-10T21:30:00Z"))
    expect(reset.toISOString()).toBe("2026-10-10T18:30:00.000Z")
  })

  it("crosses a month boundary", () => {
    // Thu 5 Nov 2026, 12:00 IST.
    const reset = weekResetAt(new Date("2026-11-05T06:30:00Z"))
    // Sun 1 Nov 00:00 IST = Sat 31 Oct 18:30 UTC.
    expect(reset.toISOString()).toBe("2026-10-31T18:30:00.000Z")
  })

  it("crosses a year boundary", () => {
    // Fri 1 Jan 2027, 12:00 IST.
    const reset = weekResetAt(new Date("2027-01-01T06:30:00Z"))
    // Sun 27 Dec 2026 00:00 IST = Sat 26 Dec 18:30 UTC.
    expect(reset.toISOString()).toBe("2026-12-26T18:30:00.000Z")
  })

  it("always lands on a Sunday in IST", () => {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "long",
    })
    for (let day = 0; day < 30; day += 1) {
      const now = new Date(Date.UTC(2026, 9, 1 + day, 7, 15))
      expect(formatter.format(weekResetAt(now))).toBe("Sunday")
    }
  })
})

describe("withinCurrentWeek", () => {
  // Wed 14 Oct 2026, 15:30 IST. Week began Sun 11 Oct 00:00 IST.
  const NOW = new Date("2026-10-14T10:00:00Z")

  it("keeps something completed earlier today", () => {
    expect(withinCurrentWeek(new Date("2026-10-14T06:00:00Z"), NOW)).toBe(true)
  })

  it("keeps something completed exactly at the reset", () => {
    expect(withinCurrentWeek(new Date("2026-10-10T18:30:00Z"), NOW)).toBe(true)
  })

  it("drops something completed a minute before the reset", () => {
    expect(withinCurrentWeek(new Date("2026-10-10T18:29:00Z"), NOW)).toBe(false)
  })

  it("drops last week's work", () => {
    expect(withinCurrentWeek(new Date("2026-10-08T09:00:00Z"), NOW)).toBe(false)
  })

  it("accepts an ISO string as well as a Date", () => {
    expect(withinCurrentWeek("2026-10-13T09:00:00.000Z", NOW)).toBe(true)
    expect(withinCurrentWeek("2026-10-01T09:00:00.000Z", NOW)).toBe(false)
  })

  it("keeps a row rather than hiding it when the date is unreadable", () => {
    // Losing a card is worse than showing one too many.
    expect(withinCurrentWeek("not a date", NOW)).toBe(true)
  })
})

describe("nextResetLabel", () => {
  it("names the Sunday the column next clears", () => {
    // Week began Sun 11 Oct, so the next one is Sun 18 Oct.
    expect(nextResetLabel(new Date("2026-10-14T10:00:00Z"))).toBe("Sunday 18 Oct")
  })

  it("names today when it is Sunday morning", () => {
    // Reset was this morning; the next is a week out.
    expect(nextResetLabel(new Date("2026-10-10T20:30:00Z"))).toBe("Sunday 18 Oct")
  })
})
