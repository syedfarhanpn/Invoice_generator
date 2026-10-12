"use client"

import { useId, useMemo, useState } from "react"

import { monotoneAreaPath, monotoneLinePath, type Point } from "@/lib/chart-path"
import { formatCompactAmount } from "@/lib/format-compact"
import { cn } from "@/lib/utils"

/**
 * Two money series on one scale, as the reference dashboard draws them.
 *
 * Both lines share a single y-axis rather than getting one each: revenue and
 * expenses are the same unit, and giving them independent scales would let a
 * small expense line sit visually above a large revenue line. Sharing the
 * axis is the whole point of putting them on one chart.
 *
 * The axis maximum is rounded up to a round number so the gridline labels
 * read ₹2L / ₹4L / ₹6L rather than ₹1.87L. An empty workspace still gets a
 * drawn axis - a chart that collapses to nothing looks broken rather than
 * empty.
 */

export type MoneyPoint = { label: string; revenue: number; expenses: number }

/**
 * An axis label drops the trailing ".0" that the compact money format keeps
 * for figures in running text: a gridline reads "₹2L", not "₹2.0L".
 */
function axisLabel(value: number, currency: string): string {
  return formatCompactAmount(value, currency).replace(/.0(?=[A-Za-z])/, "")
}

const VIEW_W = 760
const VIEW_H = 260
const PAD_LEFT = 52
const PAD_RIGHT = 12
const PAD_TOP = 16
const PAD_BOTTOM = 32

/** A round number at or above value: 1, 2 or 5 times a power of ten. */
function niceStep(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10
  return step * magnitude
}

export function RevenueExpenseChart({
  points,
  currency,
  className,
}: {
  points: MoneyPoint[]
  currency: string
  className?: string
}) {
  const revenueGradient = useId()
  const expenseGradient = useId()
  const [hover, setHover] = useState<number | null>(null)

  const { max, ticks } = useMemo(() => {
    const peak = Math.max(...points.flatMap((p) => [p.revenue, p.expenses]), 0)
    // Round the STEP, not the ceiling. Rounding the ceiling and then
    // dividing it into three gives labels like "₹66.3K" - arithmetically
    // right and unreadable. A round step makes every gridline a round
    // number, which is what an axis is for.
    const step = niceStep(peak / 3)
    const ceiling = step * 3
    return { max: ceiling, ticks: [0, step, step * 2, ceiling] }
  }, [points])

  const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM
  const baseline = PAD_TOP + plotH

  const x = (i: number) =>
    PAD_LEFT + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (value: number) => PAD_TOP + plotH - (value / max) * plotH

  const revenuePoints: Point[] = points.map((p, i) => ({ x: x(i), y: y(p.revenue) }))
  const expensePoints: Point[] = points.map((p, i) => ({ x: x(i), y: y(p.expenses) }))

  const active = hover != null ? points[hover] : null

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-64 w-full" role="img"
        aria-label={points
          .map((p) => `${p.label}: revenue ${p.revenue}, expenses ${p.expenses}`)
          .join("; ")}>
        <defs>
          <linearGradient id={revenueGradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={expenseGradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines and their labels. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={VIEW_W - PAD_RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 10}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {tick === 0 ? "0" : axisLabel(tick, currency)}
            </text>
          </g>
        ))}

        {/* Expenses behind revenue: the smaller figure should not be hidden. */}
        <path d={monotoneAreaPath(expensePoints, baseline)} fill={`url(#${expenseGradient})`} />
        <path
          d={monotoneLinePath(expensePoints)}
          fill="none"
          stroke="var(--chart-2)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        <path d={monotoneAreaPath(revenuePoints, baseline)} fill={`url(#${revenueGradient})`} />
        <path
          d={monotoneLinePath(revenuePoints)}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* A dot on each month, so a single-month workspace still shows. */}
        {points.map((point, i) => (
          <g key={point.label}>
            <circle cx={x(i)} cy={y(point.expenses)} r={hover === i ? 5 : 3.5}
              fill="var(--card)" stroke="var(--chart-2)" strokeWidth={2.5} />
            <circle cx={x(i)} cy={y(point.revenue)} r={hover === i ? 5 : 3.5}
              fill="var(--card)" stroke="var(--chart-1)" strokeWidth={2.5} />
            <text
              x={x(i)}
              y={VIEW_H - 10}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {point.label}
            </text>
            {/* A full-height target, so hovering anywhere in the column works. */}
            <rect
              x={x(i) - plotW / Math.max(points.length, 1) / 2}
              y={PAD_TOP}
              width={plotW / Math.max(points.length, 1)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>

      {active && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-sm">
          <p className="font-medium">{active.label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: "var(--chart-1)" }} />
            Revenue
            <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">
              {formatCompactAmount(active.revenue, currency)}
            </span>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} />
            Expenses
            <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">
              {formatCompactAmount(active.expenses, currency)}
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
