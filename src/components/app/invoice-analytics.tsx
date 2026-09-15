"use client"

import { useState } from "react"
import { Table2, X } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatShortDay } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { niceAxisMax, RANGES, toMajor, type RangeKey, type RangeSeries } from "@/lib/analytics"
import { cn } from "@/lib/utils"

/**
 * Invoice activity over a window, as a stacked column per day.
 *
 * Form: part-to-whole over time. Each day's column is the money invoiced that
 * day, split by what has become of it - so the three segments always sum to the
 * day's invoiced total and the stack can never out-run the amount billed.
 *
 * Colour is the status palette (good / warning / critical), not a categorical
 * one: these are states, not arbitrary series. Status colours are fixed rather
 * than themed, and the amber sits below 3:1 on a light card by design, so it
 * never carries meaning alone - every value is also printed in the legend row
 * and reachable in the table view.
 *
 * Both windows are computed on the server and handed over together, so
 * switching is instant and costs no round trip.
 */

const SERIES = [
  { key: "receivedMinor", label: "Received", color: "var(--viz-received)" },
  { key: "pendingMinor", label: "Pending", color: "var(--viz-pending)" },
  { key: "overdueMinor", label: "Overdue", color: "var(--viz-overdue)" },
] as const

/** Status palette - fixed in both themes; see references/palette.md. */
const PALETTE = {
  "--viz-received": "#0ca30c",
  "--viz-pending": "#fab219",
  "--viz-overdue": "#d03b3b",
} as React.CSSProperties

/** Plot height in px. Fixed so segment heights are exact, not percentage-rounded. */
const PLOT_HEIGHT = 180

const GRID_STEPS = [1, 0.75, 0.5, 0.25, 0]

/** Axis ticks only - deterministic grouping, no currency symbol to crowd them. */
const TICKS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

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
  const [showTable, setShowTable] = useState(false)

  const current = series[range]
  const { days, totals } = current
  const axisMax = niceAxisMax(
    Math.max(...days.map((d) => d.receivedMinor + d.pendingMinor + d.overdueMinor), 0)
  )
  const isEmpty = totals.invoicedMinor === 0

  const money = (minor: number) => formatMoney(toMajor(minor, currency), currency)
  const activeDay = active != null ? days[active] : null

  return (
    <Card style={PALETTE}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Invoice activity</CardTitle>
          <p className="text-xs text-muted-foreground">
            {totals.invoiceCount} invoice{totals.invoiceCount === 1 ? "" : "s"} issued{" "}
            {formatShortDay(current.startDate)} - {formatShortDay(current.endDate)}
          </p>
        </div>

        <div
          role="group"
          aria-label="Date range"
          className="inline-flex shrink-0 rounded-lg border p-0.5"
        >
          {RANGES.map((r) => (
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
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                range === r.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Legend and direct values in one row: identity never rests on colour
            alone, and every total is readable without hovering anything. */}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {SERIES.map((s) => (
            <div key={s.key} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <div className="text-lg leading-tight font-semibold tabular-nums">
                {money(totals[s.key])}
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex gap-2">
          {/* Y axis */}
          <div className="relative w-16 shrink-0" style={{ height: PLOT_HEIGHT }}>
            {GRID_STEPS.map((step) => (
              <span
                key={step}
                className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: `${(1 - step) * 100}%` }}
              >
                {TICKS.format(toMajor(axisMax * step, currency))}
              </span>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            <div className="relative" style={{ height: PLOT_HEIGHT }}>
              {/* Gridlines: hairline, solid, recessive. */}
              {GRID_STEPS.map((step) => (
                <div
                  key={step}
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 border-t",
                    step === 0 ? "border-border" : "border-border/60"
                  )}
                  style={{ top: `${(1 - step) * 100}%` }}
                />
              ))}

              {isEmpty && (
                <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No invoices issued in this period.
                </p>
              )}

              {/* 2px of surface between neighbours, the same gap used inside a
                  stack - separation comes from the gap, never from a stroke. */}
              <div className="absolute inset-0 flex items-stretch gap-[2px]">
                {days.map((day, i) => {
                  const stack = SERIES.map((s) => ({ ...s, minor: day[s.key] })).filter(
                    (s) => s.minor > 0
                  )
                  // Top-most segment first, so the rounded data-end lands on the
                  // top of the stack and the baseline stays square.
                  const ordered = [...stack].reverse()
                  const label = `${formatShortDay(day.date)}: ${SERIES.map(
                    (s) => `${s.label} ${money(day[s.key])}`
                  ).join(", ")}`

                  return (
                    <button
                      key={day.date}
                      type="button"
                      aria-label={label}
                      onPointerEnter={() => setActive(i)}
                      onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive((a) => (a === i ? null : a))}
                      className={cn(
                        "group/col flex min-w-0 flex-1 cursor-default flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active === i && "bg-muted/50"
                      )}
                    >
                      <span className="mx-auto flex w-full max-w-[18px] flex-col justify-end gap-[2px]">
                        {ordered.map((s, j) => (
                          <span
                            key={s.key}
                            className={cn("block w-full", j === 0 && "rounded-t-[4px]")}
                            style={{
                              backgroundColor: s.color,
                              height: `${(s.minor / axisMax) * PLOT_HEIGHT}px`,
                            }}
                          />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>

              {activeDay && (
                <div
                  role="status"
                  // Inside the plot, in the half the pointer is not in. Above
                  // the plot it would sit on top of the legend and the totals;
                  // following the column horizontally would put it over the
                  // very bar being read. This corner is always free.
                  className={cn(
                    "pointer-events-none absolute top-1 z-10 w-max max-w-[220px] rounded-lg border bg-popover p-2.5 text-popover-foreground shadow-md",
                    active! < days.length / 2 ? "right-1" : "left-1"
                  )}
                >
                  <div className="mb-1 text-xs font-medium">{formatShortDay(activeDay.date)}</div>
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
              )}
            </div>

            {/* Only the ends and the middle - a tick per day is unreadable. */}
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{formatShortDay(days[0]?.date)}</span>
              {days.length > 2 && (
                <span>{formatShortDay(days[Math.floor(days.length / 2)]?.date)}</span>
              )}
              <span>{formatShortDay(days[days.length - 1]?.date)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showTable ? <X className="size-3.5" /> : <Table2 className="size-3.5" />}
            {showTable ? "Hide table" : "Show as table"}
          </button>
          {hasMixedCurrencies && (
            <p className="text-xs text-muted-foreground">
              {currency} invoices only - you also have invoices in other currencies.
            </p>
          )}
        </div>

        {showTable && (
          <div className="max-h-64 overflow-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th scope="col" className="p-2 font-medium">Date</th>
                  {SERIES.map((s) => (
                    <th key={s.key} scope="col" className="p-2 text-right font-medium">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days
                  .filter((d) => d.receivedMinor + d.pendingMinor + d.overdueMinor > 0)
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
                    <td colSpan={4} className="p-3 text-center text-muted-foreground">
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
