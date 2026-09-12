import { describe, expect, it } from "vitest"

import { formatDocumentDate, formatDocumentDateTime } from "./dates"

describe("formatDocumentDate", () => {
  it("formats a date the way the PDF does", () => {
    // The PDF pins en-US + UTC; if these two ever disagree, the document on
    // screen and the document the client downloads show different dates.
    const value = new Date("2026-09-06T00:00:00.000Z")
    expect(formatDocumentDate(value)).toBe("9/6/2026")
    expect(new Intl.DateTimeFormat("en-US", { timeZone: "UTC" }).format(value)).toBe(
      formatDocumentDate(value)
    )
  })

  it("does not shift a midnight-UTC date into the previous day", () => {
    // Document dates are stored at midnight UTC. Formatted in a negative
    // offset they would read as the day before.
    expect(formatDocumentDate("2026-01-01T00:00:00.000Z")).toBe("1/1/2026")
    expect(formatDocumentDate("2026-12-31T00:00:00.000Z")).toBe("12/31/2026")
  })

  it("accepts a Date, an ISO string or an epoch", () => {
    const iso = "2026-03-04T00:00:00.000Z"
    expect(formatDocumentDate(iso)).toBe("3/4/2026")
    expect(formatDocumentDate(new Date(iso))).toBe("3/4/2026")
    expect(formatDocumentDate(Date.parse(iso))).toBe("3/4/2026")
  })

  it("falls back rather than rendering Invalid Date", () => {
    for (const bad of [null, undefined, "", "not a date"]) {
      expect(formatDocumentDate(bad)).toBe("-")
    }
    expect(formatDocumentDate(null, "Not set")).toBe("Not set")
  })
})

describe("formatDocumentDateTime", () => {
  it("names the zone it is showing", () => {
    expect(formatDocumentDateTime("2026-09-06T07:30:00.000Z")).toBe("9/6/2026, 7:30:00 AM UTC")
  })

  it("never emits a narrow no-break space", () => {
    // ICU 72 changed the space before AM/PM to U+202F. Node and the browser
    // ship different ICU versions, so leaving it in is the same hydration
    // mismatch this module exists to prevent.
    for (const iso of ["2026-01-01T00:05:00.000Z", "2026-06-15T13:45:09.000Z"]) {
      expect(formatDocumentDateTime(iso)).not.toMatch(/[  ]/)
    }
  })

  it("falls back rather than rendering Invalid Date", () => {
    expect(formatDocumentDateTime(null)).toBe("-")
    expect(formatDocumentDateTime("nonsense", "Unsigned")).toBe("Unsigned")
  })
})

describe("determinism", () => {
  it("is unaffected by the ambient locale and timezone", () => {
    // This is the whole point: the same input must format identically on a
    // server in Asia/Kolkata and in a browser set to en-GB.
    const value = new Date("2026-09-06T18:30:00.000Z")
    const ambient = value.toLocaleDateString()
    const pinned = formatDocumentDate(value)
    expect(pinned).toBe("9/6/2026")
    // Not asserting they differ - on an en-US/UTC machine they agree. The
    // point is that `pinned` does not depend on what `ambient` happens to be.
    expect(typeof ambient).toBe("string")
  })
})
