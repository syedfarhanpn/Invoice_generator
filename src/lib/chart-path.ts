/**
 * Smooth curves for the dashboard's area chart, without a chart library.
 *
 * Monotone cubic interpolation - Steffen's method, the one d3's curveMonotoneX
 * uses. Between two data points the curve never rises above the higher one or
 * dips below the lower. For money that is the difference between a smooth
 * chart and a wrong one: an ordinary smoothed curve overshoots, drawing a dip
 * below zero beside a day with no invoices and a crest taller than anything
 * that was actually billed.
 *
 * Works in whatever coordinates it is given. The chart passes screen space
 * (y grows downward); monotonicity survives any axis-aligned scaling, so the
 * guarantee still holds after the SVG is stretched to fit its container.
 */

export type Point = { x: number; y: number }

/** One cubic Bezier between two neighbouring points. */
export type Segment = { from: Point; c1: Point; c2: Point; to: Point }

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0
}

/** The curve's slope (dy/dx) at each point. */
export function monotoneTangents(points: Point[]): number[] {
  const n = points.length
  if (n < 2) return points.map(() => 0)

  const widths: number[] = []
  const secants: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const width = points[i + 1].x - points[i].x
    widths.push(width)
    secants.push(width === 0 ? 0 : (points[i + 1].y - points[i].y) / width)
  }

  // Two points: the straight line between them.
  if (n === 2) return [secants[0], secants[0]]

  const tangents = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    const before = secants[i - 1]
    const after = secants[i]
    const blended = (before * widths[i] + after * widths[i - 1]) / (widths[i - 1] + widths[i])
    // Zero wherever the data turns (a peak, a trough, a flat run), and never
    // steep enough to carry the curve past either neighbour.
    tangents[i] =
      (sign(before) + sign(after)) *
        Math.min(Math.abs(before), Math.abs(after), 0.5 * Math.abs(blended)) || 0
  }

  // The ends have one neighbour each, so estimate from it. The estimate stays
  // inside that segment's range too, so the first and last days cannot bulge.
  tangents[0] = (3 * secants[0] - tangents[1]) / 2 || 0
  tangents[n - 1] = (3 * secants[n - 2] - tangents[n - 2]) / 2 || 0
  return tangents
}

/** One Bezier per gap between points, control points exposed so they can be tested. */
export function monotoneSegments(points: Point[]): Segment[] {
  if (points.length < 2) return []
  const tangents = monotoneTangents(points)
  return points.slice(0, -1).map((from, i) => {
    const to = points[i + 1]
    const third = (to.x - from.x) / 3
    return {
      from,
      c1: { x: from.x + third, y: from.y + tangents[i] * third },
      c2: { x: to.x - third, y: to.y - tangents[i + 1] * third },
      to,
    }
  })
}

/** Two decimals is far below a pixel and keeps the path strings short. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

function xy({ x, y }: Point): string {
  return `${round(x)},${round(y)}`
}

/** An SVG path for the curve through `points`. */
export function monotoneLinePath(points: Point[]): string {
  if (points.length === 0) return ""
  return (
    `M${xy(points[0])}` +
    monotoneSegments(points)
      .map((s) => `C${xy(s.c1)} ${xy(s.c2)} ${xy(s.to)}`)
      .join("")
  )
}

/** The same curve, closed down to `baselineY` for the filled area beneath it. */
export function monotoneAreaPath(points: Point[], baselineY: number): string {
  if (points.length === 0) return ""
  const first = points[0]
  const last = points[points.length - 1]
  return `${monotoneLinePath(points)}L${round(last.x)},${round(baselineY)}L${round(first.x)},${round(baselineY)}Z`
}
