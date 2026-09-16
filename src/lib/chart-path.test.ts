import { describe, expect, it } from "vitest"

import {
  monotoneAreaPath,
  monotoneLinePath,
  monotoneSegments,
  monotoneTangents,
  type Point,
} from "./chart-path"

// Screen coordinates, as the chart uses them: y grows downward, so a value of
// zero sits on the baseline at y = 100 and a larger value is a smaller y.
const BASELINE = 100
const series = (values: number[], step = 10): Point[] =>
  values.map((v, i) => ({ x: i * step, y: BASELINE - v }))

// Sparse and spiky, with flat runs and a repeated peak - the shape daily
// invoice data really has, and exactly where an ordinary smoothed curve
// overshoots.
const SPIKY = series([0, 0, 45, 0, 12, 0, 0, 80, 30, 0, 95, 95, 20, 0])

const EPSILON = 1e-9

describe("monotoneSegments", () => {
  it("never overshoots a segment's endpoints", () => {
    // Between two days the curve may not rise above the higher value or dip
    // below the lower one - otherwise the chart shows money nobody invoiced.
    for (const { from, c1, c2, to } of monotoneSegments(SPIKY)) {
      const lo = Math.min(from.y, to.y) - EPSILON
      const hi = Math.max(from.y, to.y) + EPSILON
      for (const c of [c1, c2]) {
        expect(c.y).toBeGreaterThanOrEqual(lo)
        expect(c.y).toBeLessThanOrEqual(hi)
      }
    }
  })

  it("never dips below the baseline beside an empty day", () => {
    for (const { c1, c2 } of monotoneSegments(SPIKY)) {
      expect(c1.y).toBeLessThanOrEqual(BASELINE + EPSILON)
      expect(c2.y).toBeLessThanOrEqual(BASELINE + EPSILON)
    }
  })

  it("keeps a run of empty days perfectly flat", () => {
    const [first] = monotoneSegments(SPIKY) // days 0 -> 1, both zero
    expect([first.c1.y, first.c2.y]).toEqual([BASELINE, BASELINE])
  })

  it("passes through every data point", () => {
    const segments = monotoneSegments(SPIKY)
    expect(segments).toHaveLength(SPIKY.length - 1)
    segments.forEach((s, i) => {
      expect(s.from).toEqual(SPIKY[i])
      expect(s.to).toEqual(SPIKY[i + 1])
    })
  })

  it("draws collinear points as a straight line", () => {
    const line = [0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: 5 + 2 * i * 10 }))
    for (const { c1, c2 } of monotoneSegments(line)) {
      expect(c1.y).toBeCloseTo(5 + 2 * c1.x)
      expect(c2.y).toBeCloseTo(5 + 2 * c2.x)
    }
  })

  it("draws two points as a straight line", () => {
    const [segment] = monotoneSegments([
      { x: 0, y: 0 },
      { x: 30, y: 60 },
    ])
    expect(segment.c1).toEqual({ x: 10, y: 20 })
    expect(segment.c2).toEqual({ x: 20, y: 40 })
  })

  it("has no segments for fewer than two points", () => {
    expect(monotoneSegments([])).toEqual([])
    expect(monotoneSegments([{ x: 0, y: 0 }])).toEqual([])
  })
})

describe("monotoneTangents", () => {
  it("is flat at every peak and trough", () => {
    const tangents = monotoneTangents(series([0, 50, 0, 50, 0]))
    expect(tangents.slice(1, 4)).toEqual([0, 0, 0])
  })
})

describe("paths", () => {
  it("starts the line at the first point", () => {
    expect(monotoneLinePath(series([10, 40, 20])).startsWith("M0,90")).toBe(true)
  })

  it("closes the area down to the baseline", () => {
    const d = monotoneAreaPath(series([10, 40, 20]), BASELINE)
    expect(d.startsWith("M0,90")).toBe(true)
    expect(d.endsWith("L20,100L0,100Z")).toBe(true)
  })

  it("renders nothing for no data", () => {
    expect(monotoneLinePath([])).toBe("")
    expect(monotoneAreaPath([], BASELINE)).toBe("")
  })
})
