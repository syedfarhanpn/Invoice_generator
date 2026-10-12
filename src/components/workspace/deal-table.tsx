"use client"

import { useMemo, useState, useTransition } from "react"
import { Download, Search, SlidersHorizontal } from "lucide-react"

import { createDeal, moveDeal } from "@/app/(workspace)/crm/actions"
import { startProjectFromDeal } from "@/app/(workspace)/projects/actions"
import { Board, type BoardCard, type BoardColumn } from "@/components/board/board"
import { Pagination } from "@/components/app/pagination"
import { LeadsListView } from "@/components/workspace/leads-list-view"
import { pageSlice } from "@/lib/pagination"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { describeDue, type DueTone } from "@/lib/dates"
import type { WorkspaceMember } from "@/lib/members"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

import { DealDetail, type ClientOption, type DealDetailData } from "./deal-detail"

/**
 * The CRM's one dataset, read through three lenses.
 *
 * Inbox, Board and Agenda are groupings of the same rows, not three screens:
 * a board card and an agenda line are the same record drawn differently, so
 * nothing can be true in one view and false in another.
 *
 * Opening a card opens the editor, in every view. It replaced a read-only
 * side panel, which showed the same fields but left you nowhere to change
 * them - two ways to look and none to edit.
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
  assigneeName: string | null
  createdAt: string
  contactEmail: string | null
  contactPhone: string | null
  /** ISO. The last recorded exchange, or when the row last moved. */
  lastContactAt: string
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
  if (!row.nextTaskTitle) return <span className="text-tone-danger">Set next action</span>
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
  details,
  clients,
  members,
}: {
  rows: DealRow[]
  stages: StageColumn[]
  details: Record<string, DealDetailData>
  clients: ClientOption[]
  members: WorkspaceMember[]
}) {
  const [view, setView] = useState<View>("inbox")
  const [query, setQuery] = useState("")
  const [compact, setCompact] = useState(false)
  const [stageFilter, setStageFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [wonDeal, setWonDeal] = useState<{ id: string; title: string } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (stageFilter !== "all" && r.stageId !== stageFilter) return false
      if (!q) return true
      return [r.title, r.clientName, r.contactName, r.stageName, r.source]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    })
  }, [rows, query, stageFilter])

  const agenda = useMemo(
    () =>
      [...filtered]
        .filter((r) => r.nextTaskDueAt)
        .sort((a, b) => (a.nextTaskDueAt! < b.nextTaskDueAt! ? -1 : 1)),
    [filtered]
  )

  const columns: BoardColumn[] = useMemo(
    () =>
      stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        type: stage.type as BoardColumn["type"],
      })),
    [stages]
  )

  const cards: BoardCard[] = useMemo(
    () =>
      filtered.map((row) => {
        const badges: BoardCard["badges"] = []
        if (row.value != null) {
          badges.push({ label: formatMoney(row.value, row.currency), tone: "muted" })
        }
        if (row.nextTaskDueAt) {
          const { label, tone } = describeDue(row.nextTaskDueAt)
          badges.push({ label, tone: tone === "overdue" || tone === "today" ? "danger" : "muted" })
        } else if (row.stageType === "OPEN") {
          // The nudge the inbox shows, carried onto the card.
          badges.push({ label: "No next action", tone: "warning" })
        }
        if (row.source) badges.push({ label: row.source, tone: "info" })
        if (row.assigneeName) badges.push({ label: row.assigneeName, tone: "special" })

        return {
          id: row.id,
          stageId: row.stageId,
          title: row.title,
          subtitle: row.clientName || row.contactName || null,
          badges,
          done: row.stageType === "WON",
        }
      }),
    [filtered]
  )

  const handleMove = async (dealId: string, toStageId: string, toIndex: number) => {
    const result = await moveDeal(dealId, toStageId, toIndex)
    if (result.offerProject) setWonDeal({ id: dealId, title: result.title })
  }

  const rowHeight = compact ? "h-8" : "h-11"

  // Paginated like the reference. Client-side over rows the page already
  // has - see the note in src/components/app/pagination.tsx.
  const visible = pageSlice(filtered, page, pageSize)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
        <div role="group" aria-label="View" className="flex items-center gap-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                view === v.key
                  ? "bg-accent font-medium text-foreground"
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
              onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
              placeholder="Search leads..."
              aria-label="Search leads"
              className="h-8 w-44 rounded-md border bg-background pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {view === "inbox" && (
            <>
              {/* The reference's filter control, as a real stage filter.
                  Built from the board's own columns, so renaming a stage
                  renames it here too. */}
              <label className="flex items-center gap-1.5">
                <SlidersHorizontal
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="sr-only">Filter by status</span>
                <select
                  value={stageFilter}
                  onChange={(e) => {
                    setStageFilter(e.target.value)
                    setPage(1)
                  }}
                  className="h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">All statuses</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </label>

              {/* A real export, through the same gated route the reports use. */}
              <a
                href="/reports/export?report=sales&range=all"
                download
                aria-label="Export leads as CSV"
                className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Download className="size-4" strokeWidth={1.75} />
              </a>
            </>
          )}

          {view === "agenda" && (
            <button
              type="button"
              onClick={() => setCompact((v) => !v)}
              aria-pressed={compact}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {compact ? "Comfortable" : "Compact"}
            </button>
          )}
        </div>
      </header>

      {view === "board" ? (
        <Board
          columns={columns}
          cards={cards}
          onMove={handleMove}
          onCreate={createDeal}
          onOpen={setEditingId}
          addLabel="Add a lead"
        />
      ) : (
        <div className="overflow-x-auto">
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
          ) : (
            view === "agenda" ? (
              <ListView
                rows={agenda}
                rowHeight={rowHeight}
                onOpen={setEditingId}
                showStage={false}
              />
            ) : (
              <LeadsListView
                rows={visible}
                onOpen={setEditingId}
                startIndex={(page - 1) * pageSize}
              />
            )
          )}

          {view === "inbox" && filtered.length > 0 && (
            <Pagination
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(1)
              }}
              noun="leads"
            />
          )}
        </div>
      )}

      <DealDetail
        deal={editingId ? (details[editingId] ?? null) : null}
        clients={clients}
        members={members}
        onClose={() => setEditingId(null)}
      />
      <WonPrompt deal={wonDeal} onClose={() => setWonDeal(null)} />
    </div>
  )
}

/** Offered on a win, never forced - a one-off invoice is not a project. */
function WonPrompt({
  deal,
  onClose,
}: {
  deal: { id: string; title: string } | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog open={deal != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a project from this?</DialogTitle>
          <DialogDescription>
            {deal?.title} is won. A project card carries the client, value and title straight over
            to the Projects board, so none of it is retyped.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Not this one
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              if (!deal) return
              setError(null)
              startTransition(async () => {
                try {
                  await startProjectFromDeal(deal.id)
                  onClose()
                } catch {
                  setError("That project could not be created.")
                }
              })
            }}
          >
            {pending ? "Creating..." : "Start project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ListView({
  rows,
  rowHeight,
  onOpen,
  showStage,
}: {
  rows: DealRow[]
  rowHeight: string
  onOpen: (id: string) => void
  showStage: boolean
}) {
  return (
    // Fixed layout: with auto layout the truncating columns collapse while the
    // short ones expand, which handed Stage more room than Deal. The deal is
    // what you are reading; it gets the width.
    <table className="w-full table-fixed text-left text-sm">
      <colgroup>
        <col className="w-[24%]" />
        <col className="w-[17%]" />
        <col className="w-[11%]" />
        {showStage && <col className="w-[12%]" />}
        <col className="w-[13%]" />
        <col className={showStage ? "w-[14%]" : "w-[26%]"} />
        <col className="w-[9%]" />
      </colgroup>
      <thead>
        <tr className="border-b text-muted-foreground">
          <th scope="col" className="px-4 py-2 font-normal">Deal</th>
          <th scope="col" className="px-4 py-2 font-normal">Client</th>
          <th scope="col" className="px-4 py-2 text-right font-normal">Value</th>
          {showStage && <th scope="col" className="px-4 py-2 font-normal">Stage</th>}
          <th scope="col" className="px-4 py-2 font-normal">Assigned to</th>
          <th scope="col" className="px-4 py-2 font-normal">Next action</th>
          <th scope="col" className="px-4 py-2 font-normal">Due</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            onClick={() => onOpen(row.id)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onOpen(row.id)
              }
            }}
            className={cn(
              "cursor-pointer border-b transition-colors outline-none",
              "hover:bg-accent/50 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              rowHeight
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
            <td className="max-w-0 truncate px-4 text-muted-foreground">
              {row.assigneeName ?? <span className="text-tone-warning">Unassigned</span>}
            </td>
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

