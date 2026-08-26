import { describe, expect, it } from "vitest"

import { CREATABLE_TYPES, DOCUMENT_KINDS, documentKind, LINE_ITEM_TYPES } from "./document-kinds"

// These guard the accounting boundary between real invoices and the
// quote/proforma family. Getting any of them wrong puts money that was never
// billed into the dashboard totals, or burns invoice numbers on quotes.

const ALL_TYPES = Object.keys(DOCUMENT_KINDS) as (keyof typeof DOCUMENT_KINDS)[]

describe("document kind config", () => {
  it("covers every creatable type", () => {
    for (const type of CREATABLE_TYPES) {
      expect(documentKind(type)).toBeDefined()
    }
  })

  it("gives each type its own serial counter column", () => {
    // Two types sharing a column would interleave their sequences and break
    // the "each series is gapless" guarantee.
    const columns = ALL_TYPES.map((t) => DOCUMENT_KINDS[t].seqColumn)
    expect(new Set(columns).size).toBe(columns.length)
  })

  it("gives each type a distinct serial prefix", () => {
    const prefixes = ALL_TYPES.map((t) => DOCUMENT_KINDS[t].prefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it("only lets a real invoice track payments", () => {
    const tracking = ALL_TYPES.filter((t) => DOCUMENT_KINDS[t].tracksPayments)
    expect(tracking).toEqual(["INVOICE"])
  })

  it("never lets an invoice or contract convert into an invoice", () => {
    expect(DOCUMENT_KINDS.INVOICE.convertsToInvoice).toBe(false)
    expect(DOCUMENT_KINDS.CONTRACT.convertsToInvoice).toBe(false)
    expect(DOCUMENT_KINDS.QUOTE.convertsToInvoice).toBe(true)
    expect(DOCUMENT_KINDS.PROFORMA.convertsToInvoice).toBe(true)
  })

  it("requires a disclaimer on every non-invoice money document", () => {
    // A proforma that does not say it is not a tax invoice is a compliance
    // problem, not a cosmetic one.
    expect(DOCUMENT_KINDS.PROFORMA.disclaimer).toBeTruthy()
    expect(DOCUMENT_KINDS.QUOTE.disclaimer).toBeTruthy()
    expect(DOCUMENT_KINDS.INVOICE.disclaimer).toBeNull()
  })

  it("routes exactly the line-item family through the invoice editor", () => {
    const lineItem = ALL_TYPES.filter((t) => DOCUMENT_KINDS[t].isLineItemDoc).sort()
    expect(lineItem).toEqual([...LINE_ITEM_TYPES].sort())
    expect(DOCUMENT_KINDS.CONTRACT.isLineItemDoc).toBe(false)
  })

  it("never shows bank details on a quotation", () => {
    // A quote is an estimate, not a request for payment.
    expect(DOCUMENT_KINDS.QUOTE.showsPaymentDetails).toBe(false)
    expect(DOCUMENT_KINDS.INVOICE.showsPaymentDetails).toBe(true)
    expect(DOCUMENT_KINDS.PROFORMA.showsPaymentDetails).toBe(true)
  })

  it("gives every type a non-empty label, heading and description", () => {
    for (const type of ALL_TYPES) {
      const k = DOCUMENT_KINDS[type]
      expect(k.label.length).toBeGreaterThan(0)
      expect(k.heading.length).toBeGreaterThan(0)
      expect(k.description.length).toBeGreaterThan(0)
      expect(k.dateLabel.length).toBeGreaterThan(0)
    }
  })
})
