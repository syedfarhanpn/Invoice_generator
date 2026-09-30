"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import type { BoardTone } from "@/components/board/board"
import { cn } from "@/lib/utils"

/**
 * A month at a glance.
 *
 * The grid is plain calendar arithmetic on UTC dates - it is a wall chart, not
 * a set of instants, so no zone applies to it. Events arrive already mapped to
 * a day key in the operator's own zone, which is the one place the two ideas
 * meet: a 1am reminder belongs to that morning's square, not to the previous
 * day's because UTC says so.
 */

export type CalendarEvent = {
  id: string
  title: string
  /** YYYY-MM-DD in the operator's zone. */
  dayKey: string
  time: string | null
  tone: BoardTone
  kind: string
  href?: string
  done?: boolean
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const TONE_DOT: Record<BoardTone, string> = {
  success: "bg-tone-success",
  warning: "bg-tone-warning",
  info: "bg-tone-info",
  danger: "bg-tone-danger",
  special: "bg-tone-special",
  muted: "bg-muted-foreground",
}

const MONTH_NAME = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
})

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** The 42 day keys a month grid shows, Monday first. */
function buildGrid(year: number, month: number): { key: string; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  // getUTCDay is Sunday-first; the grid is Monday-first.
  const lead = (first.getUTCDay() + 6) % 7
  const start = new Date(Date.UTC(year, month - 1, 1 - lead))

  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start.getTime() + i * 86_400_000)
    return {
      key: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
      inMonth: day.getUTCMonth() === month - 1,
    }
  })
}

function shiftMonth(year: number, month: number, by: number) {
  const date = new Date(Date.UTC(year, month - 1 + by, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

export function CalendarMonth({
  year,
  month,
  events,
  todayKey,
}: {
  year: number
  month: number
  events: CalendarEvent[]
  /** Resolved on the server, so the highlight cannot disagree with the data. */
  todayKey: string
}) {
  const [selected, setSelected] = useState<string | null>(todayKey)

  const grid = useMemo(() => buildGrid(year, month), [year, month])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const list = map.get(event.dayKey)
      if (list) list.push(event)
      else map.set(event.dayKey, [event])
    }
    // Timed entries first and in order; all-day ones after.
    for (const list of map.values()) {
      list.sort((a, b) => (a.time ?? "~").localeCompare(b.time ?? "~"))
    }
    return map
  }, [events])

  const selectedEvents = selected ? (byDay.get(selected) ?? []) : []
  const label = MONTH_NAME.format(new Date(Date.UTC(year, month - 1, 1)))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{label}</h2>
          <div className="flex items-center gap-1">
            <Link
              href={`/calendar?month=${shiftMonth(year, month, -1)}`}
              aria-label="Previous month"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href="/calendar"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Today
            </Link>
            <Link
              href={`/calendar?month=${shiftMonth(year, month, 1)}`}
              aria-label="Next month"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-7 border-b">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-center text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-7 grid-rows-6">
          {grid.map((cell) => {
            const dayEvents = byDay.get(cell.key) ?? []
            const isToday = cell.key === todayKey
            const isSelected = cell.key === selected
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelected(cell.key)}
                aria-pressed={isSelected}
                className={cn(
                  "flex min-h-20 flex-col items-start gap-1 border-r border-b p-1.5 text-left outline-none transition-colors last:border-r-0",
                  !cell.inMonth && "bg-muted/30 text-muted-foreground",
                  isSelected ? "bg-accent" : "hover:bg-accent/50",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                    !isToday && !cell.inMonth && "text-muted-foreground"
                  )}
                >
                  {Number(cell.key.slice(8))}
                </span>

                <span className="flex w-full flex-col gap-0.5 overflow-hidden">
                  {dayEvents.slice(0, 2).map((event) => (
                    <span
                      key={event.id}
                      className="flex items-center gap-1 truncate text-[11px] text-muted-foreground"
                    >
                      <span
                        aria-hidden
                        className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[event.tone])}
                      />
                      <span className={cn("truncate", event.done && "line-through")}>
                        {event.title}
                      </span>
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-[11px] text-muted-foreground">
                      +{dayEvents.length - 2} more
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <aside className="w-full shrink-0 rounded-xl border bg-card p-4 lg:w-80">
        <h2 className="text-sm font-semibold">
          {selected ? formatDayHeading(selected) : "Pick a day"}
        </h2>

        {selectedEvents.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {selectedEvents.map((event) => {
              const row = (
                <>
                  <span
                    aria-hidden
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TONE_DOT[event.tone])}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm break-words",
                        event.done && "text-muted-foreground line-through"
                      )}
                    >
                      {event.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {event.time ? `${event.time} · ${event.kind}` : event.kind}
                    </span>
                  </span>
                </>
              )

              return (
                <li key={event.id}>
                  {event.href ? (
                    <Link
                      href={event.href}
                      className="flex gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
                    >
                      {row}
                    </Link>
                  ) : (
                    <span className="flex gap-2 px-2 py-1.5">{row}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </aside>
    </div>
  )
}

const DAY_HEADING = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
})

function formatDayHeading(key: string) {
  // Parsed as UTC so the heading names the square that was clicked, not
  // whatever day that midnight lands on elsewhere.
  return DAY_HEADING.format(new Date(`${key}T00:00:00Z`))
}
