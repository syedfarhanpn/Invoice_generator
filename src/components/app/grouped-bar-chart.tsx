"use client"

import { useMemo, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Several counts per period, side by side, as the reference trend draws them.
 *
 * Bars rather than lines on purpose. These are counts of discrete things that
 * happened in a month, not a quantity that existed between the months - a
 * curve through them would claim a lead was half-qualified on the 14th.
 *
 * The series are nested by definition here (every won lead was qualified,
 * every qualified lead was taken on), so they are drawn in descending width
 * order and a shared scale: the eye should read them as one shrinking cohort.
 */

export type GroupedPoint = { label: string } & Record<string, number | string>

export type BarSeries = {
  /** Key into each point. */
  key: string
  label: string
  /** A CSS colour, usually a chart token. */
  color: string
}

const VIEW_W = 720
const VIEW_H = 230
const PAD_LEFT = 34
const PAD_RIGHT = 8
const PAD_TOP = 12
const PAD_BOTTOM = 28

/** A round axis step, so gridlines read 10 / 20 / 30 rather than 13.3. */
function niceStep(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalised = value / magnitude
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10
  return Math.max(1, step * magnitude)
}

export function GroupedBarChart({
  points,
  series,
  className,
}: {
  points: GroupedPoint[]
  series: BarSeries[]
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)

  const { max, ticks } = useMemo(() => {
    const peak = Math.max(
      ...points.flatMap((p) => series.map((s) => Number(p[s.key]) || 0)),
      0
    )
    const step = niceStep(peak / 4)
    const ceiling = step * 4
    return { max: ceiling, ticks: [0, step, step * 2, step * 3, ceiling] }
  }, [points, series])

  const plotW = VIEW_W - PAD_LEFT - PAD_RIGHT
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM
  const baseline = PAD_TOP + plotH

  const groupWidth = plotW / Math.max(points.length, 1)
  // A quarter of the group left as breathing space between months.
  const barsWidth = groupWidth * 0.62
  const barWidth = barsWidth / Math.max(series.length, 1)

  const y = (value: number) => PAD_TOP + plotH - (value / max) * plotH

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-56 w-full" role="img"
        aria-label={points
          .map((p) => `${p.label}: ${series.map((s) => `${s.label} ${p[s.key]}`).join(", ")}`)
          .join("; ")}>
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
              {tick}
            </text>
          </g>
        ))}

        {points.map((point, i) => {
          const groupLeft = PAD_LEFT + i * groupWidth + (groupWidth - barsWidth) / 2
          return (
            <g key={point.label}>
              {hover === i && (
                <rect
                  x={PAD_LEFT + i * groupWidth}
                  y={PAD_TOP}
                  width={groupWidth}
                  height={plotH}
                  className="fill-muted/50"
                />
              )}

              {series.map((s, si) => {
                const value = Number(point[s.key]) || 0
                const height = Math.max(0, baseline - y(value))
                return (
                  <rect
                    key={s.key}
                    x={groupLeft + si * barWidth}
                    // A zero bar draws nothing rather than a stub, so an empty
                    // month reads as empty instead of as "a very small number".
                    y={value === 0 ? baseline : y(value)}
                    width={Math.max(barWidth - 2, 1)}
                    height={value === 0 ? 0 : height}
                    rx={2}
                    fill={s.color}
                  />
                )
              })}

              <text
                x={PAD_LEFT + i * groupWidth + groupWidth / 2}
                y={VIEW_H - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {point.label}
              </text>

              <rect
                x={PAD_LEFT + i * groupWidth}
                y={PAD_TOP}
                width={groupWidth}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          )
        })}
      </svg>

      {hover != null && points[hover] && (
        <div className="pointer-events-none absolute top-1 right-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-sm">
          <p className="font-medium">{points[hover].label}</p>
          {series.map((s) => (
            <p key={s.key} className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
              <span className="ml-auto pl-4 font-medium text-foreground tabular-nums">
                {Number(points[hover][s.key]) || 0}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
