"use client"

import { useId, useMemo, useState } from "react"

import { monotoneAreaPath, monotoneLinePath, type Point } from "@/lib/chart-path"
import { formatValue, type ValueFormat } from "@/lib/format-compact"
import { cn } from "@/lib/utils"

/**
 * A small trend chart that picks its form from the shape of the data.
 *
 * A smoothed line says "the value between these two points was somewhere in
 * between". For monthly revenue that is true enough. For daily invoicing it is
 * a lie: six of thirty days carry a figure and the rest are genuinely nothing,
 * so a curve through them draws needles that look like a rendering fault and
 * imply activity on days that had none. Sparse series are drawn as bars, which
 * claim nothing about the gaps.
 *
 * The threshold is density, not a flag the caller passes, so nobody has to
 * remember which chart is which.
 */

export type TrendPoint = { label: string; value: number }

/** Below this share of non-zero points, a line would be inventing continuity. */
const DENSITY_FOR_LINE = 0.7

const VIEW_W = 600
const VIEW_H = 180
const PAD_X = 8
const PAD_TOP = 14
const PAD_BOTTOM = 26

export function TrendChart({
  points,
  format,
  currency,
  className,
  /** Overrides the density rule when the caller genuinely knows better. */
  form,
}: {
  points: TrendPoint[]
  /** Named, not a closure - see the note in src/lib/format-compact.ts. */
  format: ValueFormat
  currency?: string
  className?: string
  form?: "line" | "bars"
}) {
  const gradientId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const chosen = useMemo(() => {
    if (form) return form
    if (points.length < 3) return "bars"
    const filled = points.filter((p) => p.value !== 0).length
    return filled / points.length >= DENSITY_FOR_LINE ? "line" : "bars"
  }, [points, form])

  const max = Math.max(...points.map((p) => p.value), 0)
  // A flat-zero series still needs a scale, or every point divides by zero.
  const scale = max || 1

  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM
  const innerW = VIEW_W - PAD_X * 2
  const y = (v: number) => PAD_TOP + plotH - (v / scale) * plotH

  const coords: Point[] = points.map((p, i) => ({
    x: PAD_X + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
    y: y(p.value),
  }))

  const baseline = PAD_TOP + plotH
  const active = hover != null ? points[hover] : null

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-44 w-full overflow-visible"
        role="img"
        aria-label={`Trend from ${points[0]?.label ?? ""} to ${points.at(-1)?.label ?? ""}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Three guides, not a grid: enough to judge height against, few
            enough that the data stays the loudest thing in the frame. */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD_X}
            x2={VIEW_W - PAD_X}
            y1={PAD_TOP + plotH * t}
            y2={PAD_TOP + plotH * t}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {chosen === "line" ? (
          <>
            <path d={monotoneAreaPath(coords, baseline)} fill={`url(#${gradientId})`} />
            <path
              d={monotoneLinePath(coords)}
              fill="none"
              stroke="var(--chart-1)"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {coords.map((c, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={hover === i ? 4 : 0}
                fill="var(--chart-1)"
                stroke="var(--card)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </>
        ) : (
          points.map((p, i) => {
            const w = Math.max(6, (innerW / points.length) * 0.55)
            const x = coords[i].x - w / 2
            const top = y(p.value)
            return (
              <rect
                key={i}
                x={x}
                y={top}
                width={w}
                height={Math.max(p.value > 0 ? 2 : 0, baseline - top)}
                rx="2"
                fill="var(--chart-1)"
                opacity={hover == null || hover === i ? 1 : 0.45}
              />
            )
          })
        )}

        {/* Full-height hit targets, so the pointer does not have to find a
            2px line or a thin bar. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${i}`}
            x={PAD_X + (i / points.length) * innerW}
            y={0}
            width={innerW / points.length}
            height={VIEW_H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      <div className="mt-1 flex justify-between px-1 text-[11px] text-muted-foreground">
        {points.map((p, i) => (
          <span key={i} className={cn(hover === i && "font-medium text-foreground")}>
            {p.label}
          </span>
        ))}
      </div>

      {active && (
        <div className="pointer-events-none absolute top-0 right-0 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
          <div className="font-medium">{formatValue(active.value, format, currency)}</div>
          <div className="text-muted-foreground">{active.label}</div>
        </div>
      )}
    </div>
  )
}
