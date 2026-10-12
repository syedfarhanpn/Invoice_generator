"use client"

import { useEffect, useRef, useState } from "react"

import { formatValue, type ValueFormat } from "@/lib/format-compact"
import { seriesColor } from "@/lib/chart-palette"
import { cn } from "@/lib/utils"

/**
 * A donut with its legend, as the references use throughout.
 *
 * The legend is the chart. Each row carries the label, the figure and the
 * share, so the ring is a summary of a list you can already read rather than
 * the only way to get the numbers - which is what keeps the colours from
 * having to carry meaning on their own.
 *
 * Slices sweep in once, when the chart first scrolls into view, by animating
 * stroke-dashoffset. That is a compositor-friendly property, and it means a
 * filter change redraws instantly instead of replaying the sweep.
 */

export type DonutSlice = {
  label: string
  value: number
  /** Overrides the palette, for slices with a fixed meaning like "Overdue". */
  color?: string
}

const SIZE = 148
const STROKE = 19
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const DURATION_MS = 700

export function DonutChart({
  slices,
  total,
  centreLabel,
  format = "integer",
  currency,
  className,
}: {
  slices: DonutSlice[]
  /** Defaults to the sum. Passed explicitly when some slices are excluded. */
  total?: number
  centreLabel?: string
  format?: ValueFormat
  currency?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [swept, setSwept] = useState(false)
  const [instant, setInstant] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // Both state writes happen in the observer callback, never in this
    // effect's synchronous pass. Reduced motion still gets the full ring; it
    // just arrives rather than sweeping.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        if (reduced) setInstant(true)
        setSwept(true)
      },
      { threshold: 0.3 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const sum = total ?? slices.reduce((acc, s) => acc + s.value, 0)
  const isEmpty = sum <= 0

  // Running offset, so each slice starts where the previous one ended.
  let consumed = 0

  return (
    <div ref={ref} className={cn("flex flex-wrap items-center gap-x-5 gap-y-4", className)}>
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={
          isEmpty ? "No data" : slices.map((s) => `${s.label}: ${s.value}`).join(", ")
        }>
          {/* The track, so an empty or part-filled ring still reads as a ring. */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={STROKE}
          />

          {!isEmpty &&
            slices.map((slice, i) => {
              const share = slice.value / sum
              const length = share * CIRCUMFERENCE
              const offset = consumed
              consumed += length
              if (slice.value <= 0) return null
              return (
                <circle
                  key={slice.label}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={slice.color ?? seriesColor(i)}
                  strokeWidth={STROKE}
                  // A 1px gap between neighbours, so adjacent slices of a
                  // similar colour still read as two.
                  strokeDasharray={`${Math.max(0, length - 1)} ${CIRCUMFERENCE}`}
                  strokeDashoffset={swept ? -offset : -offset + CIRCUMFERENCE}
                  style={{
                    transition: instant
                      ? "none"
                      : `stroke-dashoffset ${DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 60}ms`,
                  }}
                  // Starts at twelve o'clock rather than three.
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                />
              )
            })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tracking-tight tabular-nums">
            {formatValue(sum, format, currency)}
          </span>
          {centreLabel && (
            <span className="mt-0.5 text-xs text-muted-foreground">{centreLabel}</span>
          )}
        </div>
      </div>

      {/* A floor on the legend width, so it wraps below the ring in a narrow
          column rather than being squeezed until the labels vanish and the
          rows read as a bare "1  100%". */}
      <ul className="min-w-35 flex-1 space-y-2">
        {slices.length === 0 ? (
          <li className="text-sm text-muted-foreground">Nothing to show yet.</li>
        ) : (
          slices.map((slice, i) => (
            <li key={slice.label} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: slice.color ?? seriesColor(i) }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={slice.label}>
                {slice.label}
              </span>
              <span className="shrink-0 tabular-nums">
                {formatValue(slice.value, format, currency)}
              </span>
              <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {sum > 0 ? Math.round((slice.value / sum) * 100) : 0}%
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
