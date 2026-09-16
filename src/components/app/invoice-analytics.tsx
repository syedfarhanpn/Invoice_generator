"use client"

import { useId, useMemo, useRef, useState } from "react"
import { Table2, X } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RANGES, toMajor, type DayBucket, type RangeKey, type RangeSeries } from "@/lib/analytics"
import { monotoneAreaPath, monotoneLinePath, type Point } from "@/lib/chart-path"
import { formatShortDay } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * Invoice activity over a window: what was invoiced each day, and of that,
 * how much has been received and how much is overdue.
 *
 * Invoiced is the envelope - received and overdue are parts of it, so neither
 * curve can rise above it. It is the neutral area; the two parts are coloured
 * curves inside it, using categorical slots 1 and 2 (blue, orange) rather than
 * green and red. The palette validator put that green against that red at
 * delta-E 4.1 under deuteranopia - below the floor even with labels - so for a
 * common form of colour blindness the two lines would be one line.
 *
 * Curves are monotone (see src/lib/chart-path.ts), so the smoothing never
 * draws money that is not there: no dip below zero beside an empty day, no
 * crest above what was actually billed. The crosshair snaps to real days.
 *
 * Both windows arrive precomputed from the server, so switching is instant.
 */

const SERIES = [
  { key: "invoicedMinor", label: "Invoiced", color: "var(--viz-invoiced)", fillOpacity: 0.22, strokeWidth: 1.5 },
  { key: "receivedMinor", label: "Received", color: "var(--viz-received)", fillOpacity: 0.16, strokeWidth: 2 },
  { key: "overdueMinor", label: "Overdue", color: "var(--viz-overdue)", fillOpacity: 0.16, strokeWidth: 2 },
] as const

type SeriesKey = (typeof SERIES)[number]["key"]

/** Plot height in px. The date labels sit in their own band below it. */
const PLOT_HEIGHT = 240
/** Path coordinate space, stretched to the plot with preserveAspectRatio="none". */
const VIEW_W = 1000
const VIEW_H = PLOT_HEIGHT
/** Room above the tallest day, so a crest never touches the top gridline. */
const HEADROOM = 1.15
const GRID = [0, 0.25, 0.5, 0.75, 1]
/** About this many date labels at full width, half as many on a phone. */
const TARGET_LABELS = 10

function xPercent(index: number, count: number): number {
  return count <= 1 ? 50 : (index / (count - 1)) * 100
}

function seriesPoints(days: DayBucket[], key: SeriesKey, axisMax: number): Point[] {
  const toY = (minor: number) => VIEW_H - (minor / axisMax) * VIEW_H
  // A single day has nothing to curve between, so it spans the width.
  if (days.length === 1) {
    const y = toY(days[0][key])
    return [
      { x: 0, y },
      { x: VIEW_W, y },
    ]
  }
  return days.map((day, i) => ({ x: (i / (days.length - 1)) * VIEW_W, y: toY(day[key]) }))
}

/** Every step-th day counted back from today, so the latest day is always labelled. */
function axisLabels(count: number): { index: number; phoneHidden: boolean }[] {
  if (count === 0) return []
  const step = Math.max(1, Math.ceil(count / TARGET_LABELS))
  const labels: { index: number; phoneHidden: boolean }[] = []
  for (let i = count - 1, k = 0; i >= 0; i -= step, k++) {
    labels.push({ index: i, phoneHidden: k % 2 === 1 })
  }
  return labels.reverse()
}

export function InvoiceAnalytics({
  series,
  currency,
  hasMixedCurrencies,
}: {
  series: Record<RangeKey, RangeSeries>
  currency: string
  hasMixedCurrencies: boolean
}) {
  const [range, setRange] = useState<RangeKey>(RANGES[0].key)
  const [active, setActive] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const plotRef = useRef<HTMLDivElement>(null)
  // useId can contain characters that break a url(#...) reference.
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, "")

  const { days, totals, startDate, endDate } = series[range]
  const count = days.length
  const axisMax = Math.max(0, ...days.map((d) => d.invoicedMinor)) * HEADROOM || 1
  const isEmpty = totals.invoicedMinor === 0

  const paths = useMemo(
    () =>
      SERIES.map((s) => {
        const points = seriesPoints(days, s.key, axisMax)
        return { ...s, line: monotoneLinePath(points), area: monotoneAreaPath(points, VIEW_H) }
      }),
    [days, axisMax]
  )

  const money = (minor: number) => formatMoney(toMajor(minor, currency), currency)
  const readout = (day: DayBucket) =>
    `${formatShortDay(day.date)}: ${SERIES.map((s) => `${s.label} ${money(day[s.key])}`).join(", ")}`

  const activeDay = active != null && active < count ? days[active] : null
  const activeX = active != null ? xPercent(active, count) : 0
  const labels = axisLabels(count)

  /** Nearest day to the pointer - readers aim at a date, not at a 2px line. */
  function indexAt(clientX: number): number | null {
    const rect = plotRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || count === 0) return null
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    return count === 1 ? 0 : Math.round(ratio * (count - 1))
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (count === 0) return
    const last = count - 1
    const moves: Record<string, (i: number) => number> = {
      ArrowLeft: (i) => Math.max(i - 1, 0),
      ArrowRight: (i) => Math.min(i + 1, last),
      Home: () => 0,
      End: () => last,
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setActive((i) => move(i ?? last))
  }

  return (
    <Card className="[--viz-invoiced:var(--foreground)] [--viz-overdue:#eb6834] [--viz-received:#2a78d6] dark:[--viz-overdue:#d95926] dark:[--viz-received:#3987e5]">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base font-semibold">Invoice activity</CardTitle>
          <p className="text-sm text-muted-foreground">
            {totals.invoiceCount} invoice{totals.invoiceCount === 1 ? "" : "s"} issued{" "}
            {formatShortDay(startDate)} - {formatShortDay(endDate)}
          </p>
        </div>

        <div
          role="group"
          aria-label="Date range"
          className="inline-flex shrink-0 self-start overflow-hidden rounded-lg border"
        >
          {RANGES.map((r, i) => (
            <button
              key={r.key}
              type="button"
              title={r.hint}
              aria-pressed={range === r.key}
              onClick={() => {
                setRange(r.key)
                setActive(null)
              }}
              className={cn(
                "px-4 py-2 text-sm font-medium text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                i > 0 && "border-l",
                range === r.key ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* One focusable chart rather than a tab stop per day: arrow keys move
            the same crosshair the pointer does. */}
        <div
          role="group"
          aria-roledescription="chart"
          aria-label="Invoice activity by day. Use the left and right arrow keys to read each day."
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setFocused(true)
            setActive((i) => i ?? count - 1)
          }}
          onBlur={() => {
            setFocused(false)
            setActive(null)
          }}
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
        >
          <div
            ref={plotRef}
            className="relative"
            style={{ height: PLOT_HEIGHT }}
            onPointerMove={(e) => setActive(indexAt(e.clientX))}
            onPointerDown={(e) => setActive(indexAt(e.clientX))}
            onPointerLeave={() => {
              if (!focused) setActive(null)
            }}
          >
            {GRID.map((g) => (
              <div
                key={g}
                aria-hidden
                className="absolute inset-x-0 border-t border-border/70"
                style={{ top: `${g * 100}%` }}
              />
            ))}

            <svg
              aria-hidden
              className="absolute inset-0 size-full overflow-visible"
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="none"
            >
              <defs>
                {paths.map((p) => (
                  <linearGradient key={p.key} id={`${gradientId}-${p.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: p.color, stopOpacity: p.fillOpacity }} />
                    <stop offset="100%" style={{ stopColor: p.color, stopOpacity: 0 }} />
                  </linearGradient>
                ))}
              </defs>
              {/* Every fill before any stroke, so no line is ever hidden under
                  another series' wash where the curves cross. */}
              {paths.map((p) => (
                <path key={`${p.key}-area`} d={p.area} fill={`url(#${gradientId}-${p.key})`} />
              ))}
              {/* Strokes in reverse, so invoiced - the envelope - is drawn last.
                  Where a part equals the whole, as with an invoice paid in full,
                  the neutral outline stays on top instead of vanishing under
                  the coloured one and reading as "received, never invoiced". */}
              {[...paths].reverse().map((p) => (
                <path
                  key={`${p.key}-line`}
                  d={p.line}
                  fill="none"
                  style={{ stroke: p.color }}
                  strokeWidth={p.strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {isEmpty && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                No invoices issued in this period.
              </p>
            )}

            {activeDay && (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25"
                  style={{ left: `${activeX}%` }}
                />
                {SERIES.map((s) => (
                  <span
                    key={s.key}
                    aria-hidden
                    className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
                    style={{
                      left: `${activeX}%`,
                      top: `${(1 - activeDay[s.key] / axisMax) * 100}%`,
                      backgroundColor: s.color,
                    }}
                  />
                ))}
                {/* Beside the crosshair, on whichever side has room. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-2 z-10 w-max rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md"
                  style={
                    activeX <= 50
                      ? { left: `calc(${activeX}% + 14px)` }
                      : { right: `calc(${100 - activeX}% + 14px)` }
                  }
                >
                  <div className="mb-1.5 text-xs font-medium">{formatShortDay(activeDay.date)}</div>
                  <div className="space-y-1">
                    {SERIES.map((s) => (
                      <div key={s.key} className="flex items-center gap-2 text-xs">
                        <span
                          aria-hidden
                          className="h-0.5 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="font-semibold tabular-nums">{money(activeDay[s.key])}</span>
                        <span className="text-muted-foreground">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div aria-hidden className="relative mt-2 h-4 text-xs text-muted-foreground">
            {labels.map(({ index, phoneHidden }) => (
              <span
                key={days[index].date}
                className={cn("absolute top-0 whitespace-nowrap", phoneHidden && "hidden sm:block")}
                style={{
                  left: `${xPercent(index, count)}%`,
                  // The outermost labels align to the edge instead of hanging off it.
                  transform:
                    count > 1 && index === 0
                      ? "none"
                      : count > 1 && index === count - 1
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {formatShortDay(days[index].date)}
              </span>
            ))}
          </div>

          <div className="sr-only" aria-live="polite">
            {focused && activeDay ? readout(activeDay) : ""}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {/* Legend and period totals together: identity never rests on colour
              alone, and every total is readable without hovering. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-medium text-foreground">{money(totals[s.key])}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showTable ? <X className="size-3.5" /> : <Table2 className="size-3.5" />}
            {showTable ? "Hide table" : "Show as table"}
          </button>
        </div>

        {hasMixedCurrencies && (
          <p className="text-xs text-muted-foreground">
            {currency} invoices only - you also have invoices in other currencies.
          </p>
        )}

        {showTable && (
          <div className="max-h-64 overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th scope="col" className="p-2 font-medium">
                    Date
                  </th>
                  {SERIES.map((s) => (
                    <th key={s.key} scope="col" className="p-2 text-right font-medium">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days
                  .filter((d) => d.invoicedMinor > 0)
                  .map((day) => (
                    <tr key={day.date} className="border-t">
                      <th scope="row" className="p-2 text-left font-normal">
                        {formatShortDay(day.date)}
                      </th>
                      {SERIES.map((s) => (
                        <td key={s.key} className="p-2 text-right tabular-nums">
                          {money(day[s.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                {isEmpty && (
                  <tr className="border-t">
                    <td colSpan={SERIES.length + 1} className="p-3 text-center text-muted-foreground">
                      Nothing issued in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
