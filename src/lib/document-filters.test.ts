import { describe, expect, it } from "vitest"

import {
  countByFilter,
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
    ["invoice draft", doc({ status: "DRAFT", totalAmount: null }), ["all", "drafts"]],
    ["invoice unpaid", doc(), ["all", "invoiced", "outstanding"]],
    ["invoice paid", doc({ amountPaid: 1000 }), ["all", "invoiced", "paid"]],
    ["invoice overdue", doc({ dueDate: PAST }), ["all", "invoiced", "outstanding", "overdue"]],
    ["invoice part-paid past due", doc({ amountPaid: 400, dueDate: PAST }), ["all", "invoiced", "outstanding", "overdue"]],
    ["invoice paid past due", doc({ amountPaid: 1000, dueDate: PAST }), ["all", "invoiced", "paid"]],
    ["invoice void", doc({ status: "VOID" }), ["all"]],
    ["quote draft", doc({ type: "QUOTE", status: "DRAFT" }), ["all", "drafts", "quotes"]],
    ["quote issued", doc({ type: "QUOTE" }), ["all", "quotes"]],
    ["quote past valid-until", doc({ type: "QUOTE", dueDate: PAST }), ["all", "quotes"]],
    ["proforma issued", doc({ type: "PROFORMA" }), ["all", "proformas"]],
    ["proforma past valid-until", doc({ type: "PROFORMA", dueDate: PAST }), ["all", "proformas"]],
    ["contract", doc({ type: "CONTRACT" }), ["all"]],
  ])("%s", (_name, d, expected) => {
    expect(bucketsFor(d)).toEqual(expected)
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

  it("puts every document in 'all'", () => {
    for (const type of ["INVOICE", "QUOTE", "PROFORMA", "CONTRACT"] as const) {
      expect(matchesFilter(doc({ type }), "all")).toBe(true)
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
    ]
    expect(countByFilter(docs)).toEqual({
      all: 5,
      drafts: 1,
      quotes: 1,
      proformas: 1,
      invoiced: 2,
      outstanding: 1,
      paid: 1,
      overdue: 0,
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

  it("falls back to 'all' for anything unrecognised", () => {
    // The value arrives straight off the query string, so it is untrusted.
    for (const bad of [undefined, "", "bogus", "../etc", "__proto__", "constructor"]) {
      expect(parseFilter(bad)).toBe("all")
    }
  })
})
