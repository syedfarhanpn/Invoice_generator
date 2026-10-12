import { describe, expect, it } from "vitest"

import {
  billedOn,
  invoicedBetween,
  invoicedByMonth,
  invoicedByPaymentStatus,
  isBilled,
  monthStart,
  weekStart,
  yearStart,
  type InvoicedDoc,
} from "@/lib/document-trend"

const NOW = new Date("2026-06-17T10:00:00Z") // a Wednesday

function doc(overrides: Partial<InvoicedDoc> = {}): InvoicedDoc {
  return {
    type: "INVOICE",
    status: "FINALIZED",
    totalAmount: 1000,
    amountPaid: 0,
    advanceReceived: 0,
    dueDate: null,
    issueDate: new Date("2026-06-10T00:00:00Z"),
    createdAt: new Date("2026-06-10T00:00:00Z"),
    currency: "INR",
    clientId: "c1",
    ...overrides,
  }
}

describe("isBilled", () => {
  it("counts an issued invoice", () => {
    expect(isBilled(doc())).toBe(true)
  })

  it("leaves out a draft, which was never billed", () => {
    expect(isBilled(doc({ status: "DRAFT" }))).toBe(false)
  })

  it("leaves out a void, which was cancelled", () => {
    expect(isBilled(doc({ status: "VOID" }))).toBe(false)
  })

  it("leaves out quotations, proformas and contracts", () => {
    expect(isBilled(doc({ type: "QUOTE" }))).toBe(false)
    expect(isBilled(doc({ type: "PROFORMA" }))).toBe(false)
    expect(isBilled(doc({ type: "CONTRACT" }))).toBe(false)
  })
})

describe("billedOn", () => {
  it("prefers the date printed on the document", () => {
    const row = doc({
      issueDate: new Date("2026-03-04T00:00:00Z"),
      createdAt: new Date("2026-05-09T00:00:00Z"),
    })
    expect(billedOn(row).toISOString()).toBe("2026-03-04T00:00:00.000Z")
  })

  it("falls back to creation when none was recorded", () => {
    const row = doc({ issueDate: null, createdAt: new Date("2026-05-09T00:00:00Z") })
    expect(billedOn(row).toISOString()).toBe("2026-05-09T00:00:00.000Z")
  })
})

describe("weekStart", () => {
  it("walks back to Monday from midweek", () => {
    expect(weekStart(NOW).toISOString()).toBe("2026-06-15T00:00:00.000Z")
  })

  it("treats Sunday as the end of its week, not the start of the next", () => {
    // getUTCDay() calls Sunday 0; a plain subtraction would land six days on.
    const sunday = new Date("2026-06-21T23:00:00Z")
    expect(weekStart(sunday).toISOString()).toBe("2026-06-15T00:00:00.000Z")
  })

  it("returns the day itself on a Monday", () => {
    const monday = new Date("2026-06-15T18:30:00Z")
    expect(weekStart(monday).toISOString()).toBe("2026-06-15T00:00:00.000Z")
  })
})

describe("monthStart / yearStart", () => {
  it("steps back across a year boundary", () => {
    expect(monthStart(new Date("2026-01-20T00:00:00Z"), 1).toISOString()).toBe(
      "2025-12-01T00:00:00.000Z"
    )
  })

  it("gives the first instant of a year", () => {
    expect(yearStart(NOW, 1).toISOString()).toBe("2025-01-01T00:00:00.000Z")
  })
})

describe("invoicedBetween", () => {
  const JUNE = monthStart(NOW)
  const JULY = monthStart(NOW, -1)

  it("totals the invoices in the window", () => {
    const rows = [doc({ totalAmount: 1000 }), doc({ totalAmount: 250 })]
    expect(invoicedBetween(rows, JUNE, JULY, "INR")).toMatchObject({ amount: 1250, count: 2 })
  })

  it("is half-open, so months tile without double counting", () => {
    const onTheBoundary = doc({ issueDate: new Date("2026-07-01T00:00:00Z") })
    expect(invoicedBetween([onTheBoundary], JUNE, JULY, "INR").count).toBe(0)
    expect(invoicedBetween([onTheBoundary], JULY, monthStart(NOW, -2), "INR").count).toBe(1)
  })

  it("counts distinct clients, not invoices", () => {
    const rows = [doc({ clientId: "a" }), doc({ clientId: "a" }), doc({ clientId: "b" })]
    expect(invoicedBetween(rows, JUNE, JULY, "INR")).toMatchObject({ count: 3, clients: 2 })
  })

  it("counts an invoice with no client without inventing one", () => {
    const rows = [doc({ clientId: null })]
    expect(invoicedBetween(rows, JUNE, JULY, "INR")).toMatchObject({ count: 1, clients: 0 })
  })

  it("leaves out another currency rather than adding it at face value", () => {
    const rows = [doc({ totalAmount: 1000 }), doc({ totalAmount: 5000, currency: "USD" })]
    expect(invoicedBetween(rows, JUNE, JULY, "INR").amount).toBe(1000)
  })

  it("leaves out drafts and voids", () => {
    const rows = [doc({ status: "DRAFT" }), doc({ status: "VOID" }), doc({ totalAmount: 400 })]
    expect(invoicedBetween(rows, JUNE, JULY, "INR")).toMatchObject({ amount: 400, count: 1 })
  })

  it("adds in minor units, so paise do not drift", () => {
    const rows = Array.from({ length: 3 }, () => doc({ totalAmount: 0.1 }))
    expect(invoicedBetween(rows, JUNE, JULY, "INR").amount).toBe(0.3)
  })
})

describe("invoicedByMonth", () => {
  it("returns twelve labelled buckets", () => {
    const months = invoicedByMonth([], 2026, "INR")
    expect(months).toHaveLength(12)
    expect(months.map((m) => m.label)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ])
  })

  it("files each invoice under the month it was issued", () => {
    const rows = [
      doc({ issueDate: new Date("2026-02-14T00:00:00Z"), totalAmount: 500 }),
      doc({ issueDate: new Date("2026-02-28T00:00:00Z"), totalAmount: 250 }),
      doc({ issueDate: new Date("2026-11-01T00:00:00Z"), totalAmount: 900 }),
    ]
    const months = invoicedByMonth(rows, 2026, "INR")
    expect(months[1].value).toBe(750)
    expect(months[10].value).toBe(900)
    expect(months.filter((m) => m.value > 0)).toHaveLength(2)
  })

  it("ignores another year entirely", () => {
    const rows = [doc({ issueDate: new Date("2025-06-01T00:00:00Z") })]
    expect(invoicedByMonth(rows, 2026, "INR").every((m) => m.value === 0)).toBe(true)
  })
})

describe("invoicedByPaymentStatus", () => {
  const FROM = yearStart(NOW)
  const TO = yearStart(NOW, -1)

  it("splits by where each invoice stands, by value", () => {
    const rows = [
      doc({ totalAmount: 1000, amountPaid: 1000 }),
      doc({ totalAmount: 800, amountPaid: 300 }),
      doc({ totalAmount: 500, dueDate: new Date("2026-05-01T00:00:00Z") }),
      doc({ totalAmount: 200, dueDate: new Date("2026-12-01T00:00:00Z") }),
    ]
    const slices = invoicedByPaymentStatus(rows, FROM, TO, "INR", NOW)
    expect(slices).toEqual([
      { label: "Paid", value: 1000 },
      { label: "Partly paid", value: 800 },
      { label: "Overdue", value: 500 },
      { label: "Unpaid", value: 200 },
    ])
  })

  it("keeps the slices adding up to what was invoiced", () => {
    const rows = [
      doc({ totalAmount: 1000, amountPaid: 1000 }),
      doc({ totalAmount: 800, amountPaid: 300 }),
      doc({ totalAmount: 500 }),
    ]
    const total = invoicedBetween(rows, FROM, TO, "INR").amount
    const summed = invoicedByPaymentStatus(rows, FROM, TO, "INR", NOW).reduce(
      (sum, s) => sum + s.value,
      0
    )
    expect(summed).toBe(total)
  })

  it("counts an advance toward paid, like the badge does", () => {
    const rows = [doc({ totalAmount: 1000, amountPaid: 0, advanceReceived: 1000 })]
    expect(invoicedByPaymentStatus(rows, FROM, TO, "INR", NOW)).toEqual([
      { label: "Paid", value: 1000 },
    ])
  })

  it("drops empty slices rather than drawing zero-width arcs", () => {
    const rows = [doc({ totalAmount: 1000, amountPaid: 1000 })]
    expect(invoicedByPaymentStatus(rows, FROM, TO, "INR", NOW)).toHaveLength(1)
  })
})
