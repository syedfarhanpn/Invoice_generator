import { describe, expect, it } from "vitest"

import { CHART_SERIES, closestPair, distance, seriesColor, toOklab } from "./chart-palette"

/**
 * The threshold. Oklab distance is roughly "1.0 = black to white", so 0.1 is a
 * clear, comfortable step between two adjacent series at chart scale - a thin
 * line or a small donut wedge, not a large flat fill.
 */
const MIN_SEPARATION = 0.1

describe("chart palette separation", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`keeps every ${theme} series apart`, () => {
      const worst = closestPair(theme)
      // Reported rather than asserted bare, so a failure names the offenders
      // instead of just printing two numbers.
      expect(
        worst.distance,
        `closest ${theme} pair is ${worst.a}/${worst.b} at ${worst.distance.toFixed(3)}`
      ).toBeGreaterThan(MIN_SEPARATION)
    })
  }

  it("lifts every series for the dark theme", () => {
    // A colour chosen to clear contrast on white is too dark on near-black.
    for (const series of CHART_SERIES) {
      expect(series.dark.l, `${series.name} should be lighter in dark mode`).toBeGreaterThan(
        series.light.l
      )
    }
  })

  it("spreads series around the wheel rather than shading one hue", () => {
    const hues = CHART_SERIES.map((s) => s.light.h).sort((a, b) => a - b)
    for (let i = 1; i < hues.length; i++) {
      expect(hues[i] - hues[i - 1]).toBeGreaterThan(40)
    }
  })
})

describe("toOklab", () => {
  it("places hue 0 on the +a axis", () => {
    const { a, b } = toOklab({ l: 0.5, c: 0.2, h: 0 })
    expect(a).toBeCloseTo(0.2, 6)
    expect(b).toBeCloseTo(0, 6)
  })

  it("places hue 90 on the +b axis", () => {
    const { a, b } = toOklab({ l: 0.5, c: 0.2, h: 90 })
    expect(a).toBeCloseTo(0, 6)
    expect(b).toBeCloseTo(0.2, 6)
  })
})

describe("distance", () => {
  it("is zero for a colour against itself", () => {
    const c = { l: 0.6, c: 0.15, h: 200 }
    expect(distance(c, c)).toBe(0)
  })

  it("counts lightness alone when hue and chroma match", () => {
    expect(distance({ l: 0.4, c: 0.1, h: 50 }, { l: 0.7, c: 0.1, h: 50 })).toBeCloseTo(0.3, 6)
  })

  it("is symmetric", () => {
    const x = { l: 0.5, c: 0.2, h: 10 }
    const y = { l: 0.7, c: 0.1, h: 200 }
    expect(distance(x, y)).toBeCloseTo(distance(y, x), 12)
  })
})

describe("seriesColor", () => {
  it("returns a CSS variable so the colour follows the theme", () => {
    expect(seriesColor(0)).toBe("var(--chart-1)")
  })

  it("wraps rather than running off the end of the palette", () => {
    // A chart with more series than colours must still render every one.
    expect(seriesColor(CHART_SERIES.length)).toBe(seriesColor(0))
    expect(seriesColor(CHART_SERIES.length + 2)).toBe(seriesColor(2))
  })
})
