/**
 * The categorical chart series, and the check that they stay distinguishable.
 *
 * Charts appear on about a dozen screens in this app and each one picks
 * colours from here rather than naming its own, so a series means the same
 * thing on the leads funnel as on the expense breakdown.
 *
 * The separation check below measures distance in Oklab, where Euclidean
 * distance is designed to track perceived difference. It is NOT a colour
 * blindness simulation - it will not catch a red/green pair that collapses
 * under deuteranopia. That is why every chart in this app also labels its
 * series: colour narrows down which line you are looking at, it never has to
 * carry the meaning alone.
 */

export type ChartSeries = {
  /** The CSS variable, so a component writes var(--chart-1) and follows the theme. */
  token: string
  /** Human name, for legends and for the tests to report against. */
  name: string
  /** Light-theme value, as authored in globals.css. */
  light: Oklch
  /** Dark-theme value. Lifted: a series readable on white is too dark on near-black. */
  dark: Oklch
}

export type Oklch = { l: number; c: number; h: number }

export const CHART_SERIES: ChartSeries[] = [
  { token: "--chart-1", name: "blue", light: { l: 0.55, c: 0.19, h: 260 }, dark: { l: 0.68, c: 0.17, h: 260 } },
  { token: "--chart-2", name: "teal", light: { l: 0.72, c: 0.14, h: 178 }, dark: { l: 0.78, c: 0.14, h: 178 } },
  { token: "--chart-3", name: "amber", light: { l: 0.76, c: 0.15, h: 78 }, dark: { l: 0.82, c: 0.15, h: 78 } },
  { token: "--chart-4", name: "red", light: { l: 0.64, c: 0.2, h: 22 }, dark: { l: 0.7, c: 0.18, h: 22 } },
  { token: "--chart-5", name: "violet", light: { l: 0.58, c: 0.19, h: 312 }, dark: { l: 0.7, c: 0.17, h: 312 } },
]

/** Oklch is Oklab in polar form, so this is just the polar-to-cartesian step. */
export function toOklab({ l, c, h }: Oklch): { L: number; a: number; b: number } {
  const radians = (h * Math.PI) / 180
  return { L: l, a: c * Math.cos(radians), b: c * Math.sin(radians) }
}

/**
 * Perceived distance between two colours.
 *
 * Oklab was built so that plain Euclidean distance approximates perceptual
 * difference, which is the whole reason the tokens are authored in oklch.
 */
export function distance(x: Oklch, y: Oklch): number {
  const p = toOklab(x)
  const q = toOklab(y)
  return Math.sqrt((p.L - q.L) ** 2 + (p.a - q.a) ** 2 + (p.b - q.b) ** 2)
}

/**
 * The closest pair in a theme, which is the pair that decides whether the
 * palette works. Returned rather than asserted so the test can name them.
 */
export function closestPair(theme: "light" | "dark"): {
  a: string
  b: string
  distance: number
} {
  let worst = { a: "", b: "", distance: Infinity }
  for (let i = 0; i < CHART_SERIES.length; i++) {
    for (let j = i + 1; j < CHART_SERIES.length; j++) {
      const d = distance(CHART_SERIES[i][theme], CHART_SERIES[j][theme])
      if (d < worst.distance) {
        worst = { a: CHART_SERIES[i].name, b: CHART_SERIES[j].name, distance: d }
      }
    }
  }
  return worst
}

/** What a component asks for: `stroke={seriesColor(0)}`. */
export function seriesColor(index: number): string {
  const series = CHART_SERIES[index % CHART_SERIES.length]
  return `var(${series.token})`
}
