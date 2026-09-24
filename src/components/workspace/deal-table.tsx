"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { describeDue, type DueTone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

/**
 * The CRM's one table, read through three lenses.
 *
 * Inbox, Board and Agenda are groupings of the same rows, not three screens:
 * a board card and an agenda line are the same record drawn differently, so
 * nothing can be true in one view and false in another. The row is the only
 * primitive here.
 */

export type DealRow = {
  id: string
  title: string
  clientName: string | null
  contactName: string | null
  value: number | null
  currency: string
  stageId: string
  stageName: string
  stageType: "OPEN" | "WON" | "LOST"
  stagePosition: number
  source: string | null
  nextTaskTitle: string | null
  nextTaskDueAt: string | null
  createdAt: string
}

export type StageColumn = { id: string; name: string; position: number; type: string }

type View = "inbox" | "board" | "agenda"

const VIEWS: { key: View; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "board", label: "Board" },
  { key: "agenda", label: "Agenda" },
]

const TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-tone-danger",
  today: "text-tone-danger",
  upcoming: "text-muted-foreground",
  none: "text-muted-foreground",
}

function Money({ value, currency }: { value: number | null; currency: string }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return <span className="tabular-nums">{formatMoney(value, currency)}</span>
}

/** The empty next action is the one thing on the screen asking to be filled. */
function NextAction({ row }: { row: DealRow }) {
  if (!row.nextTaskTitle) {
    return (
      <span className="text-tone-danger">Set next action</span>
    )
  }
  return <span className="truncate text-foreground">{row.nextTaskTitle}</span>
}

function Due({ value }: { value: string | null }) {
  const { label, tone } = describeDue(value)
  if (!label) return <span className="text-muted-foreground">—</span>
  return <span className={cn("tabular-nums", TONE_CLASS[tone])}>{label}</span>
}

export function DealTable({
  rows,
  stages,
}: {
  rows: DealRow[]
  stages: StageColumn[]
}) {
  const [view, setView] = useState<View>("inbox")
  const [query, setQuery] = useState("")
  const [compact, setCompact] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.title, r.clientName, r.contactName, r.stageName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    )
  }, [rows, query])

  const agenda = useMemo(
    () =>
      [...filtered]
        .filter((r) => r.nextTaskDueAt)
        .sort((a, b) => (a.nextTaskDueAt! < b.nextTaskDueAt! ? -1 : 1)),
    [filtered]
  )

  const openRow = filtered.find((r) => r.id === selected) ?? null
  const rowHeight = compact ? "h-8" : "h-11"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
        <div
          role="group"
          aria-label="View"
          className="flex items-center gap-0.5"
        >
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                view === v.key
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.5}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deals"
              aria-label="Search deals"
              className="h-8 w-44 rounded-md border border-border bg-background pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            aria-pressed={compact}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {compact ? "Comfortable" : "Compact"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm text-foreground">
                {rows.length === 0 ? "No deals yet" : "Nothing matches that search"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {rows.length === 0
                  ? "Leads from your site form and Meta ads will land here as soon as they are connected."
                  : "Try a client name, a deal title or a stage."}
              </p>
            </div>
          ) : view === "board" ? (
            <BoardView rows={filtered} stages={stages} onSelect={setSelected} selected={selected} />
          ) : (
            <ListView
              rows={view === "agenda" ? agenda : filtered}
              rowHeight={rowHeight}
              onSelect={setSelected}
              selected={selected}
              showStage={view !== "agenda"}
            />
          )}
        </div>

        {openRow && (
          <aside className="hidden w-100 shrink-0 overflow-auto border-l border-border bg-muted p-4 lg:block">
            <div className="text-sm font-medium">{openRow.title}</div>
            <dl className="mt-4 space-y-3 text-sm">
              <Field label="Client" value={openRow.clientName} />
              <Field label="Contact" value={openRow.contactName} />
              <Field label="Stage" value={openRow.stageName} />
              <Field label="Source" value={openRow.source} />
              <div>
                <dt className="text-muted-foreground">Value</dt>
                <dd className="mt-0.5">
                  <Money value={openRow.value} currency={openRow.currency} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Next action</dt>
                <dd className="mt-0.5">
                  <NextAction row={openRow} />
                </dd>
              </div>
            </dl>
          </aside>
        )}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value || "—"}</dd>
    </div>
  )
}

function ListView({
  rows,
  rowHeight,
  onSelect,
  selected,
  showStage,
}: {
  rows: DealRow[]
  rowHeight: string
  onSelect: (id: string) => void
  selected: string | null
  showStage: boolean
}) {
  return (
    // Fixed layout: with auto layout the truncating columns collapse while the
    // short ones expand, which handed Stage more room than Deal. The deal is
    // what you are reading; it gets the width.
    <table className="w-full table-fixed text-left text-sm">
      <colgroup>
        <col className="w-[30%]" />
        <col className="w-[20%]" />
        <col className="w-[12%]" />
        {showStage && <col className="w-[14%]" />}
        <col className={showStage ? "w-[14%]" : "w-[28%]"} />
        <col className="w-[10%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          <th scope="col" className="px-4 py-2 font-normal">Deal</th>
          <th scope="col" className="px-4 py-2 font-normal">Client</th>
          <th scope="col" className="px-4 py-2 text-right font-normal">Value</th>
          {showStage && <th scope="col" className="px-4 py-2 font-normal">Stage</th>}
          <th scope="col" className="px-4 py-2 font-normal">Next action</th>
          <th scope="col" className="px-4 py-2 font-normal">Due</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            onClick={() => onSelect(row.id)}
            aria-selected={selected === row.id}
            className={cn(
              "cursor-default border-b border-border transition-colors",
              rowHeight,
              selected === row.id ? "bg-muted" : "hover:bg-muted/60"
            )}
          >
            <td className="max-w-0 truncate px-4">{row.title}</td>
            <td className="max-w-0 truncate px-4 text-muted-foreground">
              {row.clientName || row.contactName || "—"}
            </td>
            <td className="px-4 text-right">
              <Money value={row.value} currency={row.currency} />
            </td>
            {showStage && <td className="px-4 text-muted-foreground">{row.stageName}</td>}
            <td className="max-w-0 truncate px-4">
              <NextAction row={row} />
            </td>
            <td className="px-4 whitespace-nowrap">
              <Due value={row.nextTaskDueAt} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BoardView({
  rows,
  stages,
  onSelect,
  selected,
}: {
  rows: DealRow[]
  stages: StageColumn[]
  onSelect: (id: string) => void
  selected: string | null
}) {
  return (
    <div className="flex h-full gap-6 overflow-x-auto p-4">
      {stages.map((stage) => {
        const inStage = rows.filter((r) => r.stageId === stage.id)
        return (
          <section key={stage.id} className="flex w-64 shrink-0 flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">{stage.name}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {inStage.length}
              </span>
            </div>
            <div className="flex flex-col">
              {inStage.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onSelect(row.id)}
                  className={cn(
                    "border-b border-border px-1 py-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected === row.id ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <div className="truncate">{row.title}</div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">
                      {row.clientName || row.contactName || "—"}
                    </span>
                    <Due value={row.nextTaskDueAt} />
                  </div>
                </button>
              ))}
              {inStage.length === 0 && (
                <p className="py-2.5 text-xs text-muted-foreground">Nothing here</p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
