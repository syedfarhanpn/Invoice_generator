"use client"

import { useId, useMemo, useState } from "react"

import { monotoneAreaPath, monotoneLinePath, type Point } from "@/lib/chart-path"
import { formatValue, type ValueFormat } from "@/lib/format-compact"
import { cn } from "@/lib/utils"

/**
 * One series over time, with a labelled axis - the shape the reference uses
 * for a running total.
 *
 * Deliberately separate from the revenue/expense chart: that one exists to
 * compare two money series on a shared scale, this one draws a single count
 * and has no currency to think about. Folding them together would mean a
 * component with two unrelated jobs and a prop to pick between them.
 */

export type AreaPoint = { label: string; value: number }

const VIEW_W = 720
const VIEW_H = 240
const PAD_LEFT = 38
const PAD_RIGHT = 10
const PAD_TOP = 14
const PAD_BOTTOM = 30

/** A round number at or above value, so gridlines read 20 / 40 / 60. */
function niceStep(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10
  return Math.max(1, step * magnitude)
}

export function AreaChart({
  points,
  /** What one unit is, for the tooltip: "clients", "leads". Omitted when the
   *  value is money and already reads as an amount. */
  noun,
  /**
   * How to render a value. Named rather than passed as a function: a Server
   * Component cannot hand a closure across the boundary - see the note in
   * src/lib/format-compact.ts.
   */
  format = "integer",
  currency,
  className,
}: {
  points: AreaPoint[]
  noun?: string
  format?: ValueFormat
  currency?: string
  className?: string
}) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const { max, ticks } = useMemo(() => {
    const peak = Math.max(...points.map((p) => p.value), 0)
    const step = niceStep(peak / 4)
    const ceiling = step * 4
    return { max: ceiling, ticks: [0, step, step * 2, step * 3, ceiling] }
  }, [points])

  const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM
  const baseline = PAD_TOP + plotH

  const x = (i: number) =>
    PAD_LEFT + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (value: number) => PAD_TOP + plotH - (value / max) * plotH

  const coords: Point[] = points.map((p, i) => ({ x: x(i), y: y(p.value) }))
  const active = hover != null ? points[hover] : null

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-60 w-full" role="img"
        aria-label={points
          .map((p) => `${p.label}: ${formatValue(p.value, format, currency)}${noun ? ` ${noun}` : ""}`)
          .join(", ")}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

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
              x={PAD_LEFT - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {/* Compact on the axis whatever the tooltip does: "4L" fits in
                  the gutter, "₹4,00,000" does not. */}
              {format === "integer" || format === "percent"
                ? formatValue(tick, format, currency)
                : formatValue(tick, "compactCurrency", currency)}
            </text>
          </g>
        ))}

        <path d={monotoneAreaPath(coords, baseline)} fill={`url(#${gradientId})`} />
        <path
          d={monotoneLinePath(coords)}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* The hovered column gets a guide line, as the reference shows. */}
        {hover != null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={PAD_TOP}
            y2={baseline}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {points.map((point, i) => (
          <g key={point.label}>
            <circle
              cx={x(i)}
              cy={y(point.value)}
              r={hover === i ? 5 : 3.5}
              fill="var(--card)"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
            />
            <text
              x={x(i)}
              y={VIEW_H - 9}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {point.label}
            </text>
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
        <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-lg border bg-popover px-3 py-1.5 text-xs shadow-sm">
          <p className="font-medium">{active.label}</p>
          <p className="text-muted-foreground tabular-nums">
            {formatValue(active.value, format, currency)}
            {noun ? ` ${noun}` : ""}
          </p>
        </div>
      )}
    </div>
  )
}
