import { describe, expect, it } from "vitest"

import type { FilterableDoc } from "./document-filters"
import { summariseDocuments } from "./document-stats"

/**
 * The invariant worth protecting: received + outstanding = invoiced, and
 * overdue stays inside outstanding rather than beside it.
 */

const PAST = new Date("2020-01-01T00:00:00Z")
const FUTURE = new Date("2099-01-01T00:00:00Z")

function doc(partial: Partial<FilterableDoc> = {}): FilterableDoc {
  return {
    type: "INVOICE",
    status: "FINALIZED",
    totalAmount: 10_000,
    amountPaid: 0,
    dueDate: FUTURE,
    currency: "INR",
    advanceReceived: 0,
    ...partial,
  } as FilterableDoc
}

describe("summariseDocuments", () => {
  it("splits invoiced into received and outstanding with nothing left over", () => {
    const stats = summariseDocuments(
      [
        doc({ totalAmount: 10_000, amountPaid: 4_000 }),
        doc({ totalAmount: 5_000, amountPaid: 5_000 }),
        doc({ totalAmount: 2_000, amountPaid: 0 }),
      ],
      "INR"
    )

    expect(stats.invoiced).toBe(17_000)
    expect(stats.outstanding).toBe(8_000)
    expect(stats.received).toBe(9_000)
    expect(stats.received + stats.outstanding).toBe(stats.invoiced)
  })

  it("keeps overdue inside outstanding rather than beside it", () => {
    const stats = summariseDocuments(
      [
        doc({ totalAmount: 6_000, amountPaid: 1_000, dueDate: PAST }),
        doc({ totalAmount: 4_000, amountPaid: 0, dueDate: FUTURE }),
      ],
      "INR"
    )

    expect(stats.outstanding).toBe(9_000)
    expect(stats.overdue).toBe(5_000)
    expect(stats.overdueCount).toBe(1)
    // Adding them would bill the same 5,000 twice.
    expect(stats.overdue).toBeLessThanOrEqual(stats.outstanding)
  })

  it("does not let an overpayment push received past invoiced", () => {
    // balanceMinor floors at zero, so summing payments directly would report
    // 12,000 received against 10,000 invoiced.
    const stats = summariseDocuments([doc({ totalAmount: 10_000, amountPaid: 12_000 })], "INR")

    expect(stats.invoiced).toBe(10_000)
    expect(stats.received).toBe(10_000)
    expect(stats.outstanding).toBe(0)
  })

  it("counts an advance as received", () => {
    const stats = summariseDocuments(
      [doc({ totalAmount: 10_000, amountPaid: 0, advanceReceived: 3_000 })],
      "INR"
    )

    expect(stats.received).toBe(3_000)
    expect(stats.outstanding).toBe(7_000)
  })

  it("bills neither drafts nor voids", () => {
    const stats = summariseDocuments(
      [
        doc({ status: "DRAFT", totalAmount: 50_000 }),
        doc({ status: "VOID", totalAmount: 90_000 }),
        doc({ totalAmount: 1_000 }),
      ],
      "INR"
    )

    expect(stats.invoiced).toBe(1_000)
    expect(stats.draftCount).toBe(1)
  })

  it("keeps quotes and proformas out of invoiced", () => {
    const stats = summariseDocuments(
      [
        doc({ type: "QUOTE", totalAmount: 20_000 }),
        doc({ type: "PROFORMA", totalAmount: 30_000 }),
        doc({ type: "INVOICE", totalAmount: 1_000 }),
      ],
      "INR"
    )

    expect(stats.quoted).toBe(50_000)
    expect(stats.quotedCount).toBe(2)
    expect(stats.invoiced).toBe(1_000)
  })

  it("drops an archived quote from the pipeline - the decision is taken", () => {
    const stats = summariseDocuments(
      [
        doc({ type: "QUOTE", status: "ARCHIVED", totalAmount: 20_000 }),
        doc({ type: "QUOTE", totalAmount: 5_000 }),
      ],
      "INR"
    )

    expect(stats.quoted).toBe(5_000)
    expect(stats.quotedCount).toBe(1)
  })

  it("leaves contracts out of every money figure", () => {
    const stats = summariseDocuments([doc({ type: "CONTRACT", totalAmount: 80_000 })], "INR")

    expect(stats.invoiced).toBe(0)
    expect(stats.quoted).toBe(0)
    expect(stats.outstanding).toBe(0)
  })

  it("excludes other currencies and says how many it excluded", () => {
    const stats = summariseDocuments(
      [doc({ totalAmount: 1_000 }), doc({ totalAmount: 500, currency: "USD" })],
      "INR"
    )

    expect(stats.invoiced).toBe(1_000)
    expect(stats.otherCurrencyCount).toBe(1)
  })

  it("does not drift when summing amounts with paise", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004. Minor units make it exact.
    const rows = Array.from({ length: 100 }, () => doc({ totalAmount: 0.1, amountPaid: 0 }))
    const stats = summariseDocuments(rows, "INR")

    expect(stats.invoiced).toBe(10)
    expect(stats.outstanding).toBe(10)
    expect(stats.received).toBe(0)
  })

  it("treats a finalized invoice with no total as nothing billed", () => {
    const stats = summariseDocuments([doc({ totalAmount: null })], "INR")

    expect(stats.invoiced).toBe(0)
    expect(stats.outstanding).toBe(0)
    expect(stats.received).toBe(0)
  })

  it("survives an empty book", () => {
    const stats = summariseDocuments([], "INR")

    expect(stats.invoiced).toBe(0)
    expect(stats.received).toBe(0)
    expect(stats.outstanding).toBe(0)
    expect(stats.overdue).toBe(0)
    expect(stats.quoted).toBe(0)
  })
})
