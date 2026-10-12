import { describe, expect, it } from "vitest"

import {
  formatAmount,
  formatCompactAmount,
  formatDelta,
  percentChange,
} from "./format-compact"

describe("formatAmount", () => {
  it("groups INR the way its readers group it", () => {
    // 4,85,000 not 485,000 - the reference, and the local convention.
    expect(formatAmount(485000, "INR")).toBe("₹4,85,000")
  })

  it("groups other currencies in thousands", () => {
    expect(formatAmount(485000, "USD")).toBe("$485,000")
  })

  it("rounds away the paise rather than showing them on a glance figure", () => {
    expect(formatAmount(1234.56, "INR")).toBe("₹1,235")
  })

  it("survives an unknown currency code instead of throwing", () => {
    expect(formatAmount(1000, "XYZ")).toContain("1,000")
  })
})

describe("formatCompactAmount", () => {
  it("uses lakh and crore for INR", () => {
    expect(formatCompactAmount(2480000, "INR")).toBe("₹24.8L")
    expect(formatCompactAmount(12000000, "INR")).toBe("₹1.2Cr")
  })

  it("uses K/M for other currencies", () => {
    expect(formatCompactAmount(2480000, "USD")).toBe("$2.5M")
    expect(formatCompactAmount(4800, "USD")).toBe("$4.8K")
  })

  it("escalates to the larger unit rather than piling up the smaller one", () => {
    // 2.48 crore, not 248 lakh.
    expect(formatCompactAmount(24800000, "INR")).toBe("₹2.5Cr")
  })

  it("drops the decimal above 100 so the figure cannot outgrow its card", () => {
    // Only reachable at the top unit, since anything below it escalates first.
    expect(formatCompactAmount(2.48e9, "INR")).toBe("₹248Cr")
    expect(formatCompactAmount(2.48e11, "USD")).toBe("$248B")
  })

  it("keeps small amounts whole", () => {
    expect(formatCompactAmount(850, "INR")).toBe("₹850")
  })

  it("keeps the sign on a negative", () => {
    expect(formatCompactAmount(-250000, "INR")).toBe("-₹2.5L")
  })

  it("renders zero as zero, not as an abbreviation", () => {
    expect(formatCompactAmount(0, "INR")).toBe("₹0")
  })
})

describe("percentChange", () => {
  it("computes an ordinary rise", () => {
    expect(percentChange(128, 100)).toBeCloseTo(28, 6)
  })

  it("computes a fall", () => {
    expect(percentChange(88, 100)).toBeCloseTo(-12, 6)
  })

  it("returns null when the previous period was zero", () => {
    // "Up from nothing" is not a percentage. Infinity and 100% are both lies,
    // so the caller is made to say "new" instead.
    expect(percentChange(500, 0)).toBeNull()
  })

  it("handles a negative baseline without flipping the sign", () => {
    // Growing from -100 to -50 is an improvement, not a 50% decline.
    expect(percentChange(-50, -100)).toBeCloseTo(50, 6)
  })

  it("still divides by a base of one when no floor is asked for", () => {
    expect(percentChange(21, 1)).toBeCloseTo(2000, 6)
  })

  it("refuses a base below the floor the caller set", () => {
    // +2000% is arithmetically right and tells the reader nothing.
    expect(percentChange(21, 1, 5)).toBeNull()
    expect(percentChange(21, 4, 5)).toBeNull()
  })

  it("computes normally once the base reaches the floor", () => {
    expect(percentChange(21, 5, 5)).toBeCloseTo(320, 6)
  })

  it("applies the floor to negative bases by magnitude", () => {
    expect(percentChange(-1, -2, 5)).toBeNull()
    expect(percentChange(-5, -10, 5)).toBeCloseTo(50, 6)
  })
})

describe("formatDelta", () => {
  it("always carries the sign", () => {
    expect(formatDelta(28)).toBe("+28%")
    expect(formatDelta(-12)).toBe("-12%")
  })

  it("keeps one decimal only when it says something", () => {
    expect(formatDelta(32.8)).toBe("+32.8%")
    expect(formatDelta(33.0)).toBe("+33%")
  })

  it("does not render zero with a plus", () => {
    expect(formatDelta(0)).toBe("0%")
  })
})
