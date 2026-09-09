import { describe, expect, it } from "vitest"

import {
  countByFilter,
  DEFAULT_FILTER,
  DOCUMENT_FILTERS,
  type FilterableDoc,
  type FilterKey,
  matchesFilter,
  parseFilter,
} from "./document-filters"

const FUTURE = new Date(Date.now() + 30 * 864e5)
const PAST = new Date(Date.now() - 30 * 864e5)

const doc = (o: Partial<FilterableDoc> = {}): FilterableDoc => ({
  type: "INVOICE",
  status: "FINALIZED",
  totalAmount: 1000,
  amountPaid: 0,
  dueDate: FUTURE,
  currency: "INR",
  ...o,
})

const bucketsFor = (d: FilterableDoc): FilterKey[] =>
  DOCUMENT_FILTERS.map((f) => f.key).filter((k) => matchesFilter(d, k))

describe("matchesFilter", () => {
  it.each([
    ["invoice draft", doc({ status: "DRAFT", totalAmount: null }), ["active", "all", "drafts"]],
    ["invoice unpaid", doc(), ["active", "all", "invoiced", "outstanding"]],
    ["invoice overdue", doc({ dueDate: PAST }), ["active", "all", "invoiced", "outstanding", "overdue"]],
    ["invoice part-paid past due", doc({ amountPaid: 400, dueDate: PAST }), ["active", "all", "invoiced", "outstanding", "overdue"]],
    // Settled invoices leave the default view - that is the whole point of it.
    ["invoice paid", doc({ amountPaid: 1000 }), ["all", "invoiced", "paid"]],
    ["invoice paid past due", doc({ amountPaid: 1000, dueDate: PAST }), ["all", "invoiced", "paid"]],
    // Void is opt-in only.
    ["invoice void", doc({ status: "VOID" }), ["all", "void"]],
    ["quote draft", doc({ type: "QUOTE", status: "DRAFT" }), ["active", "all", "drafts", "quotes"]],
    ["quote issued", doc({ type: "QUOTE" }), ["active", "all", "quotes"]],
    ["quote past valid-until", doc({ type: "QUOTE", dueDate: PAST }), ["active", "all", "quotes"]],
    ["proforma issued", doc({ type: "PROFORMA" }), ["active", "all", "proformas"]],
    // A finalized contract is awaiting signature, so it still needs attention.
    ["contract awaiting signature", doc({ type: "CONTRACT" }), ["active", "all"]],
    // Once signed it is finished.
    ["contract signed", doc({ type: "CONTRACT", status: "SIGNED" }), ["all"]],
    ["archived invoice", doc({ status: "ARCHIVED" }), ["all", "invoiced", "outstanding"]],
  ])("%s", (_name, d, expected) => {
    expect(bucketsFor(d)).toEqual(expected)
  })

  describe("the default view", () => {
    it("hides fully paid invoices", () => {
      expect(matchesFilter(doc({ amountPaid: 1000 }), "active")).toBe(false)
    })

    it("hides void documents", () => {
      for (const type of ["INVOICE", "QUOTE", "PROFORMA", "CONTRACT"] as const) {
        expect(matchesFilter(doc({ type, status: "VOID" }), "active")).toBe(false)
      }
    })

    it("shows drafts that have not been finalized yet", () => {
      for (const type of ["INVOICE", "QUOTE", "PROFORMA", "CONTRACT"] as const) {
        expect(matchesFilter(doc({ type, status: "DRAFT" }), "active")).toBe(true)
      }
    })

    it("shows part-paid invoices, since money is still owed", () => {
      expect(matchesFilter(doc({ amountPaid: 400 }), "active")).toBe(true)
    })

    it("counts an advance towards settling the invoice", () => {
      // 600 paid + 400 advance settles a 1000 invoice, so it drops out.
      expect(matchesFilter(doc({ amountPaid: 600, advanceReceived: 400 }), "active")).toBe(false)
    })
  })

  describe("the void view", () => {
    it("shows only void documents", () => {
      expect(matchesFilter(doc({ status: "VOID" }), "void")).toBe(true)
      for (const status of ["DRAFT", "FINALIZED", "SIGNED", "ARCHIVED"] as const) {
        expect(matchesFilter(doc({ status }), "void")).toBe(false)
      }
    })
  })

  it("never counts a quote or proforma as money owed", () => {
    // The accounting boundary: only a real invoice is a receivable. If this
    // ever fails, the dashboard is reporting revenue that was never billed.
    const moneyFilters: FilterKey[] = ["invoiced", "outstanding", "paid", "overdue"]
    for (const type of ["QUOTE", "PROFORMA", "CONTRACT"] as const) {
      for (const status of ["DRAFT", "FINALIZED", "SIGNED", "VOID", "ARCHIVED"] as const) {
        for (const dueDate of [FUTURE, PAST, null]) {
          const d = doc({ type, status, dueDate, amountPaid: 500 })
          for (const f of moneyFilters) {
            expect(matchesFilter(d, f), `${type}/${status} matched ${f}`).toBe(false)
          }
        }
      }
    }
  })

  it("never counts a draft or void invoice as billed", () => {
    for (const status of ["DRAFT", "VOID"] as const) {
      expect(matchesFilter(doc({ status }), "invoiced")).toBe(false)
      expect(matchesFilter(doc({ status }), "outstanding")).toBe(false)
    }
  })

  it("puts every document in 'all', including void", () => {
    for (const type of ["INVOICE", "QUOTE", "PROFORMA", "CONTRACT"] as const) {
      expect(matchesFilter(doc({ type }), "all")).toBe(true)
      expect(matchesFilter(doc({ type, status: "VOID" }), "all")).toBe(true)
    }
  })
})

describe("countByFilter", () => {
  it("counts each bucket independently", () => {
    const docs = [
      doc({ status: "DRAFT" }),
      doc(),
      doc({ amountPaid: 1000 }),
      doc({ type: "QUOTE" }),
      doc({ type: "PROFORMA" }),
      doc({ status: "VOID" }),
    ]
    expect(countByFilter(docs)).toEqual({
      active: 4,
      all: 6,
      drafts: 1,
      quotes: 1,
      proformas: 1,
      invoiced: 2,
      outstanding: 1,
      paid: 1,
      overdue: 0,
      void: 1,
    })
  })

  it("returns a zeroed record for no documents", () => {
    const counts = countByFilter([])
    expect(Object.values(counts).every((n) => n === 0)).toBe(true)
  })
})

describe("parseFilter", () => {
  it("accepts every declared filter key", () => {
    for (const { key } of DOCUMENT_FILTERS) expect(parseFilter(key)).toBe(key)
  })

  it("falls back to the default view for anything unrecognised", () => {
    // The value arrives straight off the query string, so it is untrusted.
    for (const bad of [undefined, "", "bogus", "../etc", "__proto__", "constructor"]) {
      expect(parseFilter(bad)).toBe(DEFAULT_FILTER)
    }
  })

  it("defaults to the needs-attention view, not to all", () => {
    expect(DEFAULT_FILTER).toBe("active")
  })
})
