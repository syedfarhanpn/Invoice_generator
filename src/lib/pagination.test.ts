import { describe, expect, it } from "vitest"

import { clampPage, pageSlice, pageWindow } from "./pagination"

describe("pageWindow", () => {
  it("lists every page when there are few enough to show", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it("always keeps the first and last page reachable", () => {
    const window = pageWindow(6, 12)
    expect(window[0]).toBe(1)
    expect(window.at(-1)).toBe(12)
  })

  it("collapses the run between the ends into a single gap", () => {
    expect(pageWindow(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12])
  })

  it("keeps the current page surrounded by its neighbours", () => {
    const window = pageWindow(7, 20)
    expect(window).toContain(6)
    expect(window).toContain(7)
    expect(window).toContain(8)
  })

  it("holds a steady width near the start", () => {
    // Guards the control from visibly resizing as you walk through pages.
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, "gap", 20])
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, "gap", 20])
  })

  it("holds a steady width near the end", () => {
    expect(pageWindow(20, 20)).toEqual([1, "gap", 17, 18, 19, 20])
    expect(pageWindow(19, 20)).toEqual([1, "gap", 17, 18, 19, 20])
  })

  it("never emits a gap that hides exactly one page", () => {
    // "1 … 3" would be absurd when 2 is the only thing behind the gap.
    for (let total = 1; total <= 30; total++) {
      for (let current = 1; current <= total; current++) {
        const window = pageWindow(current, total)
        for (let i = 1; i < window.length - 1; i++) {
          if (window[i] !== "gap") continue
          const before = window[i - 1] as number
          const after = window[i + 1] as number
          expect(after - before).toBeGreaterThan(1)
        }
      }
    }
  })

  it("emits no page outside the range", () => {
    for (let total = 1; total <= 30; total++) {
      for (let current = 1; current <= total; current++) {
        for (const entry of pageWindow(current, total)) {
          if (entry === "gap") continue
          expect(entry).toBeGreaterThanOrEqual(1)
          expect(entry).toBeLessThanOrEqual(total)
        }
      }
    }
  })

  it("never repeats a page", () => {
    for (let total = 1; total <= 30; total++) {
      for (let current = 1; current <= total; current++) {
        const pages = pageWindow(current, total).filter((p) => p !== "gap")
        expect(new Set(pages).size).toBe(pages.length)
      }
    }
  })

  it("handles a single page", () => {
    expect(pageWindow(1, 1)).toEqual([1])
  })
})

describe("clampPage", () => {
  it("keeps a valid page as it is", () => {
    expect(clampPage(3, 10)).toBe(3)
  })

  it("pulls a page past the end back to the last one", () => {
    // A filter can shrink the list while you are on page 9.
    expect(clampPage(9, 3)).toBe(3)
  })

  it("pulls a page below one up to the first", () => {
    expect(clampPage(0, 10)).toBe(1)
    expect(clampPage(-5, 10)).toBe(1)
  })

  it("stays on page one when there is nothing to show", () => {
    expect(clampPage(1, 0)).toBe(1)
  })
})

describe("pageSlice", () => {
  const rows = Array.from({ length: 23 }, (_, i) => i + 1)

  it("returns the first page", () => {
    expect(pageSlice(rows, 1, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it("returns a short final page rather than padding it", () => {
    expect(pageSlice(rows, 3, 10)).toEqual([21, 22, 23])
  })

  it("clamps a page past the end instead of returning nothing", () => {
    // A filter shrinking the list must not leave you staring at an empty table.
    expect(pageSlice(rows, 99, 10)).toEqual([21, 22, 23])
  })

  it("handles an empty list", () => {
    expect(pageSlice([], 1, 10)).toEqual([])
  })

  it("handles a page size larger than the list", () => {
    expect(pageSlice([1, 2], 1, 50)).toEqual([1, 2])
  })
})
