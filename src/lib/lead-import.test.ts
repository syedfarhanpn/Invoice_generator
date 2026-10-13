import { describe, expect, it } from "vitest"

import {
  parseCsv,
  parseLeadCsv,
  parseLeadDate,
  readHeadings,
  suggestMapping,
} from "@/lib/lead-import"

describe("parseCsv", () => {
  it("splits plain rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ])
  })

  it("keeps a comma that is inside quotes", () => {
    expect(parseCsv('name,city\nPriya,"Delhi, India"')).toEqual([
      ["name", "city"],
      ["Priya", "Delhi, India"],
    ])
  })

  it("reads a doubled quote as one literal quote", () => {
    expect(parseCsv('note\n"They said ""urgent"" twice"')).toEqual([
      ["note"],
      ['They said "urgent" twice'],
    ])
  })

  it("survives a newline inside a quoted answer", () => {
    const rows = parseCsv('name,note\nPriya,"line one\nline two"')
    expect(rows).toHaveLength(2)
    expect(rows[1][1]).toBe("line one\nline two")
  })

  it("treats CRLF as one break", () => {
    expect(parseCsv("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("strips the BOM Excel writes", () => {
    expect(parseCsv("﻿name\nPriya")[0]).toEqual(["name"])
  })

  it("drops blank lines rather than emitting empty rows", () => {
    expect(parseCsv("a\n\n1\n")).toEqual([["a"], ["1"]])
  })

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([])
  })
})

describe("parseLeadCsv", () => {
  it("matches the three fixed fields however they are spelled", () => {
    const result = parseLeadCsv(
      "Full Name,Email Address,Phone Number\nPriya Nair,priya@example.com,+91 98765 43210"
    )
    expect(result.leads).toHaveLength(1)
    expect(result.leads[0]).toMatchObject({
      name: "Priya Nair",
      email: "priya@example.com",
      phone: "+919876543210",
    })
  })

  it("matches headings whatever their case or separators", () => {
    const result = parseLeadCsv("full_name,EMAIL,mobile number\nA,a@b.co,9876543210")
    expect(result.leads[0]).toMatchObject({ name: "A", email: "a@b.co", phone: "9876543210" })
    expect(result.extraColumns).toEqual([])
  })

  it("keeps every other column as a labelled line in the description", () => {
    const result = parseLeadCsv(
      [
        "name,email,phone,What business do you run?,How soon do you need this?",
        "Priya,priya@example.com,9876543210,Bakery,Within a week",
      ].join("\n")
    )
    expect(result.leads[0].description).toBe(
      "What business do you run?: Bakery\nHow soon do you need this?: Within a week"
    )
    expect(result.extraColumns).toEqual([
      "What business do you run?",
      "How soon do you need this?",
    ])
  })

  it("handles a completely different set of extra questions", () => {
    // The whole point: the second ad asks nothing the first one did.
    const result = parseLeadCsv(
      "name,phone,email,City,Budget,Heard about us from\nRia,9876543210,r@x.co,Kochi,2 lakh,Instagram"
    )
    expect(result.leads[0].description).toBe(
      "City: Kochi\nBudget: 2 lakh\nHeard about us from: Instagram"
    )
  })

  it("leaves out an extra column the row had no answer for", () => {
    const result = parseLeadCsv("name,email,Budget,City\nRia,r@x.co,,Kochi")
    expect(result.leads[0].description).toBe("City: Kochi")
  })

  it("skips a row with neither email nor phone", () => {
    const result = parseLeadCsv("name,email,phone\nGhost,,\nReal,real@x.co,")
    expect(result.leads).toHaveLength(1)
    expect(result.leads[0].name).toBe("Real")
    expect(result.skipped).toEqual([{ line: 2, reason: "No email or phone number" }])
  })

  it("accepts a lead with only a phone number", () => {
    const result = parseLeadCsv("name,email,phone\nRia,,9876543210")
    expect(result.leads).toHaveLength(1)
    expect(result.leads[0]).toMatchObject({ email: null, phone: "9876543210" })
  })

  it("rejects an address that is not one, rather than storing a dud", () => {
    const result = parseLeadCsv("name,email,phone\nRia,not-an-email,9876543210")
    expect(result.leads[0].email).toBeNull()
  })

  it("rejects a phone number too short to be one", () => {
    const result = parseLeadCsv("name,email,phone\nRia,r@x.co,12")
    expect(result.leads[0].phone).toBeNull()
  })

  it("falls back to the address when the form asked for no name", () => {
    const result = parseLeadCsv("email,phone\nria@example.com,9876543210")
    expect(result.leads[0].name).toBe("ria@example.com")
  })

  it("keeps a second name column as an answer instead of overwriting the first", () => {
    const result = parseLeadCsv("Name,Email,Name of business\nRia,r@x.co,Ria Bakes")
    expect(result.leads[0].name).toBe("Ria")
    expect(result.leads[0].description).toBe("Name of business: Ria Bakes")
  })

  it("reports the line a skipped row was on, counting the header", () => {
    const result = parseLeadCsv("name,email,phone\nA,a@x.co,\nB,,\nC,c@x.co,")
    expect(result.skipped).toEqual([{ line: 3, reason: "No email or phone number" }])
  })

  it("returns nothing for an empty file", () => {
    expect(parseLeadCsv("")).toEqual({
      leads: [],
      extraColumns: [],
      skipped: [],
      unreadableDates: 0,
    })
  })

  it("returns nothing for a header with no rows under it", () => {
    expect(parseLeadCsv("name,email,phone").leads).toEqual([])
  })

  it("tolerates a row with fewer cells than the header", () => {
    const result = parseLeadCsv("name,email,phone,City\nRia,r@x.co")
    expect(result.leads).toHaveLength(1)
    expect(result.leads[0].phone).toBeNull()
  })
})

describe("readHeadings", () => {
  it("returns the first row, trimmed", () => {
    expect(readHeadings("  Full Name , Email ,Phone\nA,b@c.co,1")).toEqual([
      "Full Name",
      "Email",
      "Phone",
    ])
  })

  it("returns nothing for an empty file", () => {
    expect(readHeadings("")).toEqual([])
  })

  it("reads headings even when there are no rows under them", () => {
    expect(readHeadings("name,email")).toEqual(["name", "email"])
  })
})

describe("suggestMapping", () => {
  it("finds each field by meaning", () => {
    expect(suggestMapping(["Full Name", "Email Address", "Phone Number", "Created At"])).toEqual({
      name: 0,
      email: 1,
      phone: 2,
      createdAt: 3,
    })
  })

  it("leaves a field unmapped when the file has no such column", () => {
    expect(suggestMapping(["Email", "City"])).toEqual({
      name: null,
      email: 0,
      phone: null,
      createdAt: null,
    })
  })

  it("keeps the first column claiming a field, not the last", () => {
    expect(suggestMapping(["Name", "Email", "Name of business"]).name).toBe(0)
  })

  it("recognises the headings Meta writes", () => {
    const mapping = suggestMapping(["created_time", "full_name", "phone_number", "email"])
    expect(mapping).toEqual({ name: 1, email: 3, phone: 2, createdAt: 0 })
  })
})

describe("parseLeadDate", () => {
  const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null

  it("reads ISO with a zone", () => {
    expect(parseLeadDate("2025-10-12T08:30:00+00:00")?.toISOString()).toBe(
      "2025-10-12T08:30:00.000Z"
    )
  })

  it("reads a bare ISO day", () => {
    expect(day(parseLeadDate("2025-10-12"))).toBe("2025-10-12")
  })

  it("reads a slash date day-first, as an Indian export writes it", () => {
    // 3 April, not 4 March.
    expect(day(parseLeadDate("03/04/2026"))).toBe("2026-04-03")
  })

  it("uses the unambiguous order when one part is above twelve", () => {
    expect(day(parseLeadDate("25/10/2026"))).toBe("2026-10-25")
    // Month-first here, because 25 cannot be a month.
    expect(day(parseLeadDate("10/25/2026"))).toBe("2026-10-25")
  })

  it("reads two-digit years as this century", () => {
    expect(day(parseLeadDate("05/11/25"))).toBe("2025-11-05")
  })

  it("accepts dashes and dots as separators", () => {
    expect(day(parseLeadDate("05-11-2025"))).toBe("2025-11-05")
    expect(day(parseLeadDate("05.11.2025"))).toBe("2025-11-05")
  })

  it("reads a written month, where there is no order to misread", () => {
    expect(day(parseLeadDate("12 Oct 2025"))).toBe("2025-10-12")
  })

  it("refuses a day that does not exist rather than rolling it forward", () => {
    // Date would turn 31 February into 3 March.
    expect(parseLeadDate("31/02/2026")).toBeNull()
  })

  it("returns null for nonsense instead of inventing a date", () => {
    expect(parseLeadDate("sometime last week")).toBeNull()
    expect(parseLeadDate("")).toBeNull()
    expect(parseLeadDate("99/99/9999")).toBeNull()
  })
})

describe("parseLeadCsv with an explicit mapping", () => {
  const FILE = [
    "Col A,Col B,Col C,Col D,Notes",
    "Priya,priya@example.com,9876543210,2025-10-12,Wants a bakery site",
  ].join("\n")

  it("uses the columns the operator assigned, not the headings", () => {
    // Headings that match nothing: only an explicit mapping can read this.
    const result = parseLeadCsv(FILE, { name: 0, email: 1, phone: 2, createdAt: 3 })
    expect(result.leads[0]).toMatchObject({
      name: "Priya",
      email: "priya@example.com",
      phone: "9876543210",
    })
    expect(result.leads[0].createdAt?.toISOString().slice(0, 10)).toBe("2025-10-12")
  })

  it("puts every unassigned column into the description", () => {
    const result = parseLeadCsv(FILE, { name: 0, email: 1, phone: 2, createdAt: 3 })
    expect(result.leads[0].description).toBe("Notes: Wants a bakery site")
    expect(result.extraColumns).toEqual(["Notes"])
  })

  it("moves a column into the description when it is unassigned", () => {
    // Date left unmapped: it stops being a date and becomes an answer.
    const result = parseLeadCsv(FILE, { name: 0, email: 1, phone: 2, createdAt: null })
    expect(result.leads[0].createdAt).toBeNull()
    expect(result.leads[0].description).toBe("Col D: 2025-10-12\nNotes: Wants a bakery site")
  })

  it("counts rows whose date could not be read, but still imports them", () => {
    const file = "a,b,c\nPriya,priya@x.co,whenever"
    const result = parseLeadCsv(file, { name: 0, email: 1, phone: null, createdAt: 2 })
    expect(result.leads).toHaveLength(1)
    expect(result.leads[0].createdAt).toBeNull()
    expect(result.unreadableDates).toBe(1)
  })

  it("does not count a blank date cell as unreadable", () => {
    const file = "a,b,c\nPriya,priya@x.co,"
    const result = parseLeadCsv(file, { name: 0, email: 1, phone: null, createdAt: 2 })
    expect(result.unreadableDates).toBe(0)
  })

  it("falls back to automatic matching when no mapping is given", () => {
    const result = parseLeadCsv("name,email,created_time\nA,a@b.co,2025-10-12")
    expect(result.leads[0].name).toBe("A")
    expect(result.leads[0].createdAt?.toISOString().slice(0, 10)).toBe("2025-10-12")
  })
})
