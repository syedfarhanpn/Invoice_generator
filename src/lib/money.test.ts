import { describe, expect, it } from "vitest"

import { computeTotals, formatMoney, lineAmount, paymentSummary } from "./money"

// These are the invoice-correctness invariants. A regression here silently
// bills a client the wrong amount, so they are the highest-value tests in the
// repo - see the minor-units rationale at the top of money.ts.

describe("computeTotals", () => {
  it("sums line items without float drift", () => {
    // 0.1 + 0.2 territory: naive float maths gives 3.0000000000000004
    const t = computeTotals(
      [
        { description: "a", qty: 3, rate: 0.1 },
        { description: "b", qty: 3, rate: 0.9 },
      ],
      "USD",
      "NONE",
      null
    )
    expect(t.subtotal).toBe(3)
    expect(t.subtotalMinor).toBe(300)
  })

  it("quantises the rate to the currency minor unit before multiplying", () => {
    // Documented behaviour, pinned deliberately: toMinor() rounds the RATE
    // first (0.005 -> 1 cent, half-up), then multiplies by qty. So this is
    // 3 x 1 cent = 3, not 3 x 0.005 = 1.5 -> 2.
    //
    // Consequence worth knowing: a sub-cent rate is rounded UP to one cent
    // per unit, so 100000 x 0.005 bills 1000.00 rather than 500.00. Fine for
    // freelance/agency rates; wrong for per-unit metered pricing. Changing it
    // would alter the totals of existing invoices, so it is a deliberate
    // decision, not a silent fix.
    const t = computeTotals([{ description: "a", qty: 3, rate: 0.005 }], "USD", "NONE", null)
    expect(t.subtotalMinor).toBe(3)
  })

  it("keeps whole-unit rates exact at high quantities", () => {
    const t = computeTotals([{ description: "a", qty: 100_000, rate: 2.5 }], "USD", "NONE", null)
    expect(t.subtotal).toBe(250_000)
  })

  it("applies percentage tax to the subtotal", () => {
    const t = computeTotals([{ description: "a", qty: 2, rate: 500 }], "INR", "PERCENTAGE", 18)
    expect(t.subtotal).toBe(1000)
    expect(t.taxAmount).toBe(180)
    expect(t.total).toBe(1180)
  })

  it("ignores the tax rate when the mode is NONE", () => {
    const t = computeTotals([{ description: "a", qty: 1, rate: 100 }], "INR", "NONE", 18)
    expect(t.taxAmount).toBe(0)
    expect(t.total).toBe(100)
  })

  it("treats missing or malformed line values as zero rather than NaN", () => {
    const t = computeTotals(
      [{ description: "a", qty: undefined as unknown as number, rate: 50 }],
      "USD",
      "NONE",
      null
    )
    expect(t.total).toBe(0)
    expect(Number.isNaN(t.total)).toBe(false)
  })

  it("respects zero-decimal currencies", () => {
    // JPY has no minor unit, so 100.4 must not become 10040 minor units
    const t = computeTotals([{ description: "a", qty: 1, rate: 100.4 }], "JPY", "NONE", null)
    expect(t.subtotalMinor).toBe(100)
    expect(t.subtotal).toBe(100)
  })
})

describe("lineAmount", () => {
  it("matches the per-line contribution to the subtotal", () => {
    expect(lineAmount({ description: "a", qty: 2.5, rate: 4.44 }, "USD")).toBe(11.1)
  })
})

describe("paymentSummary", () => {
  const future = new Date(Date.now() + 7 * 864e5)
  const past = new Date(Date.now() - 7 * 864e5)

  it("labels a draft as Draft regardless of amounts", () => {
    expect(paymentSummary(1000, 0, past, true, "INR").label).toBe("Draft")
  })

  it("labels a settled invoice Paid", () => {
    const s = paymentSummary(1000, 1000, future, false, "INR")
    expect(s.label).toBe("Paid")
    expect(s.balanceMinor).toBe(0)
  })

  it("labels an unpaid, not-yet-due invoice Unpaid", () => {
    expect(paymentSummary(1000, 0, future, false, "INR").label).toBe("Unpaid")
  })

  it("labels an unpaid past-due invoice Overdue", () => {
    expect(paymentSummary(1000, 0, past, false, "INR").label).toBe("Overdue")
  })

  it("labels a part-paid past-due invoice Partial, but still flags isOverdue", () => {
    // Documented quirk: the label check for a payment on file wins over the
    // due date, so label and isOverdue deliberately disagree here. The
    // Overdue *filter* keys off isOverdue - see document-filters.ts.
    const s = paymentSummary(1000, 400, past, false, "INR")
    expect(s.label).toBe("Partial")
    expect(s.isOverdue).toBe(true)
  })

  it("never reports a settled invoice as overdue", () => {
    expect(paymentSummary(1000, 1000, past, false, "INR").isOverdue).toBe(false)
  })

  it("never returns a negative balance on an overpayment", () => {
    const s = paymentSummary(1000, 1500, future, false, "INR")
    expect(s.balanceMinor).toBe(0)
    expect(s.label).toBe("Paid")
  })

  it("is not overdue when no due date is set", () => {
    expect(paymentSummary(1000, 0, null, false, "INR").isOverdue).toBe(false)
  })

  it("treats a null total as zero rather than NaN", () => {
    const s = paymentSummary(null, 0, future, false, "INR")
    expect(s.totalMinor).toBe(0)
    expect(Number.isNaN(s.balance)).toBe(false)
  })
})

describe("formatMoney", () => {
  it("falls back to a readable string for an unknown currency code", () => {
    expect(formatMoney(10, "NOTACURRENCY")).toContain("10.00")
  })

  it("coerces null to zero instead of rendering NaN", () => {
    expect(formatMoney(null, "USD")).not.toContain("NaN")
  })
})
