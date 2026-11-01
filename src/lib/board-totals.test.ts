import { describe, expect, it } from "vitest"

import { leadingTotal, summarizeValues } from "@/lib/board-totals"

describe("summarizeValues", () => {
  it("adds up the cards in one currency", () => {
    const s = summarizeValues(
      [
        { value: 45000, currency: "INR" },
        { value: 15000, currency: "INR" },
      ],
      "INR"
    )
    expect(s.totals).toEqual([{ currency: "INR", amount: 60000 }])
    expect(s.valued).toBe(2)
    expect(s.count).toBe(2)
  })

  it("never adds two currencies together", () => {
    const s = summarizeValues(
      [
        { value: 45000, currency: "INR" },
        { value: 2000, currency: "USD" },
      ],
      "INR"
    )
    expect(s.totals).toEqual([
      { currency: "INR", amount: 45000 },
      { currency: "USD", amount: 2000 },
    ])
  })

  it("puts the workspace currency first even when another is larger", () => {
    const s = summarizeValues(
      [
        { value: 100, currency: "INR" },
        { value: 900000, currency: "USD" },
      ],
      "INR"
    )
    expect(s.totals[0].currency).toBe("INR")
  })

  it("counts unpriced cards without pretending they are worth zero", () => {
    const s = summarizeValues(
      [{ value: 45000, currency: "INR" }, { value: null }, {}, { value: 0 }],
      "INR"
    )
    expect(s.totals).toEqual([{ currency: "INR", amount: 45000 }])
    expect(s.valued).toBe(1)
    expect(s.count).toBe(4)
  })

  it("ignores values that are not real positive numbers", () => {
    const s = summarizeValues(
      [{ value: -500 }, { value: Number.NaN }, { value: Number.POSITIVE_INFINITY }],
      "INR"
    )
    expect(s.totals).toEqual([])
    expect(s.valued).toBe(0)
  })

  it("files a card with no currency under the workspace's", () => {
    const s = summarizeValues([{ value: 1000 }, { value: 500, currency: "inr" }], "INR")
    expect(s.totals).toEqual([{ currency: "INR", amount: 1500 }])
  })

  it("handles an empty column", () => {
    expect(summarizeValues([], "INR")).toEqual({ totals: [], valued: 0, count: 0 })
  })
})

describe("leadingTotal", () => {
  it("is the workspace currency's figure", () => {
    const s = summarizeValues([{ value: 5000, currency: "INR" }], "INR")
    expect(leadingTotal(s, "INR")).toEqual({ currency: "INR", amount: 5000 })
  })

  it("is zero, not missing, when nothing is priced", () => {
    expect(leadingTotal(summarizeValues([{}, {}], "INR"), "inr")).toEqual({
      currency: "INR",
      amount: 0,
    })
  })
})
