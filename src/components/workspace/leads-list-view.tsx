"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Mail, MoreHorizontal, Phone } from "lucide-react"

import { archiveDeal, convertDealToClient } from "@/app/(workspace)/crm/actions"
import { startProjectFromDeal } from "@/app/(workspace)/projects/actions"
import { RowCheckbox } from "@/components/app/selection-bar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { memberInitials } from "@/lib/member-names"
import { formatTableDay } from "@/lib/dates"
import { cn } from "@/lib/utils"

import type { DealRow } from "./deal-table"

/**
 * The leads table, laid out as the reference dashboard.
 *
 * Split out of deal-table.tsx because it is now a different shape from the
 * agenda list it used to share code with: avatars, a status pill, the last
 * exchange and the next follow-up, with per-row actions on the right.
 *
 * The call and mail buttons are real links and appear only when there is an
 * address or number to use. A row with no contact details shows nothing there
 * rather than a button that opens an empty mail client.
 */

/** "10 Oct 2026", shared with every other list in the product. */
const formatDay = formatTableDay

/**
 * A pill colour per stage.
 *
 * Won and lost are fixed, because those two always mean the same thing. The
 * open stages cycle a small palette by board position, so a five-column
 * pipeline reads as a progression rather than five identical chips - and an
 * operator who renames or reorders their columns keeps a sensible spread
 * without configuring anything.
 */
const OPEN_TONES = [
  "bg-tone-info-bg text-tone-info",
  "bg-tone-special-bg text-tone-special",
  "bg-tone-warning-bg text-tone-warning",
  "bg-chart-1/10 text-chart-1",
]

function stageTone(row: DealRow): string {
  if (row.stageType === "WON") return "bg-tone-success-bg text-tone-success"
  if (row.stageType === "LOST") return "bg-tone-danger-bg text-tone-danger"
  return OPEN_TONES[row.stagePosition % OPEN_TONES.length]
}

function Avatar({ name }: { name: string | null }) {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-accent-foreground"
    >
      {name ? memberInitials(name) : "—"}
    </span>
  )
}

/**
 * The width of card each column needs before it shows, narrowest first.
 *
 * The table never scrolls sideways. As the card narrows, the less-used
 * columns step out instead of running past its edge, and the name takes
 * whatever room is left and truncates. These are container queries rather
 * than screen breakpoints, so collapsing the sidebar brings columns back.
 */
const COLUMN = {
  lastContact: "hidden @xl:table-cell",
  assignee: "hidden @2xl:table-cell",
  nextFollowUp: "hidden @3xl:table-cell",
  index: "hidden @4xl:table-cell",
  source: "hidden @5xl:table-cell",
  service: "hidden @6xl:table-cell",
}

/** Present only while the list is in Select mode. */
export type LeadSelection = {
  selected: ReadonlySet<string>
  onToggle: (id: string, on: boolean) => void
}

export function LeadsListView({
  rows,
  onOpen,
  startIndex,
  selection,
}: {
  rows: DealRow[]
  onOpen: (id: string) => void
  /** Where this page begins, so the # column counts across pages. */
  startIndex: number
  selection?: LeadSelection
}) {
  // The header box acts on the rows on screen, not on every filtered lead:
  // ticking it should select what you can see, not quietly arm a delete
  // against 300 rows when 10 are in front of you.
  const allSelected = !!selection && rows.length > 0 && rows.every((r) => selection.selected.has(r.id))
  const someSelected = !!selection && rows.some((r) => selection.selected.has(r.id))

  return (
    <div className="@container">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
            {selection && (
              <th scope="col" className="w-10 px-4 py-2.5">
                <RowCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={(on) => rows.forEach((r) => selection.onToggle(r.id, on))}
                  label="Select all leads on this page"
                />
              </th>
            )}
            <th scope="col" className={cn("w-10 px-4 py-2.5 font-normal", COLUMN.index)}>#</th>
            {/* Lines up with the card's own padding while # is hidden. */}
            <th scope="col" className="w-full py-2.5 pr-3 pl-4 font-normal @4xl:pl-3">Name</th>
            <th scope="col" className={cn("px-3 py-2.5 font-normal", COLUMN.source)}>Source</th>
            <th scope="col" className={cn("px-3 py-2.5 font-normal", COLUMN.service)}>
              Service Interested
            </th>
            <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
            <th scope="col" className={cn("px-3 py-2.5 font-normal", COLUMN.assignee)}>
              Assigned To
            </th>
            <th scope="col" className={cn("px-3 py-2.5 font-normal", COLUMN.lastContact)}>
              Last Contact
            </th>
            <th scope="col" className={cn("px-3 py-2.5 font-normal", COLUMN.nextFollowUp)}>
              Next Follow-up
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-normal">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <LeadRow
              key={row.id}
              row={row}
              index={startIndex + i}
              onOpen={onOpen}
              selection={selection}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LeadRow({
  row,
  index,
  onOpen,
  selection,
}: {
  row: DealRow
  index: number
  onOpen: (id: string) => void
  selection?: LeadSelection
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const name = row.contactName || row.clientName || row.title
  // The company rides under the name rather than in a column of its own:
  // most leads have none, and a column of dashes was costing the width
  // the rest of the row needed.
  const company = row.contactName && row.clientName !== row.contactName ? row.clientName : null

  return (
    <tr
      onClick={() => onOpen(row.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(row.id)
        }
      }}
      className={cn(
        "cursor-pointer border-b whitespace-nowrap transition-colors outline-none",
        "hover:bg-accent/50 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        pending && "opacity-60"
      )}
    >
      {selection && (
        // Both stopped: the row opens the lead on click, and on Space - which
        // is also how a keyboard ticks a checkbox.
        <td
          className="px-4 py-2.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <RowCheckbox
            checked={selection.selected.has(row.id)}
            onChange={(on) => selection.onToggle(row.id, on)}
            label={`Select ${name}`}
          />
        </td>
      )}
      <td className={cn("px-4 py-2.5 text-muted-foreground tabular-nums", COLUMN.index)}>
        {String(index + 1).padStart(2, "0")}
      </td>

      {/* The column that gives way: it takes the room the others leave and
          truncates, so a long name can no longer push the row past the card. */}
      <td className="w-full max-w-0 py-2.5 pr-3 pl-4 @4xl:pl-3">
        <span className="flex items-center gap-2">
          <Avatar name={name} />
          <span className="min-w-0">
            <span className="block truncate font-medium" title={name}>
              {name}
            </span>
            {company && (
              <span className="block truncate text-xs text-muted-foreground" title={company}>
                {company}
              </span>
            )}
          </span>
        </span>
        {error && <span className="mt-0.5 block text-xs whitespace-normal text-destructive">{error}</span>}
      </td>

      <td className={cn("px-3 py-2.5 text-muted-foreground", COLUMN.source)}>
        <span className="block max-w-32 truncate" title={row.source ?? undefined}>
          {row.source ?? "Not recorded"}
        </span>
      </td>
      <td className={cn("px-3 py-2.5 text-muted-foreground", COLUMN.service)}>
        <span className="block max-w-40 truncate" title={row.title}>
          {row.title}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <span
          title={row.stageName}
          className={cn(
            "inline-block max-w-36 truncate rounded-md px-2 py-0.5 align-middle text-xs font-medium",
            stageTone(row)
          )}
        >
          {row.stageName}
        </span>
      </td>

      <td className={cn("px-3 py-2.5", COLUMN.assignee)}>
        {row.assigneeName ? (
          <span className="flex items-center gap-2">
            <Avatar name={row.assigneeName} />
            <span className="max-w-24 truncate text-muted-foreground">
              {row.assigneeName.split(/\s+/)[0]}
            </span>
          </span>
        ) : (
          <span className="text-tone-warning">Unassigned</span>
        )}
      </td>

      <td className={cn("px-3 py-2.5 text-muted-foreground", COLUMN.lastContact)}>
        {formatDay(row.lastContactAt)}
      </td>
      <td className={cn("px-3 py-2.5 text-muted-foreground", COLUMN.nextFollowUp)}>
        {formatDay(row.nextTaskDueAt)}
      </td>

      {/* The row opens the lead, so every control here stops propagation. */}
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        {/* Each button keeps its slot when a lead lacks a number or an
            address, so the icons line up down the column instead of sliding
            right into whichever slot is free. */}
        <span className="flex items-center justify-end gap-1">
          {row.contactPhone ? (
            <a
              href={`tel:${row.contactPhone}`}
              aria-label={`Call ${name}`}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Phone className="size-3.5" strokeWidth={1.75} />
            </a>
          ) : (
            <span aria-hidden className="size-7" />
          )}
          {/* Phone-width cards keep the call button and give the mail one's
              width to the name; the address is still in the lead itself. */}
          {row.contactEmail ? (
            <a
              href={`mailto:${row.contactEmail}`}
              aria-label={`Email ${name}`}
              className="hidden size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring @md:flex"
            >
              <Mail className="size-3.5" strokeWidth={1.75} />
            </a>
          ) : (
            <span aria-hidden className="hidden size-7 @md:block" />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${name}`}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpen(row.id)}>View details</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const { clientId } = await convertDealToClient(row.id)
                      router.push(`/dashboard/clients/${clientId}`)
                    } catch (cause) {
                      // A lead with no email cannot become a client. Saying
                      // which lead and why beats a menu item that does
                      // nothing when you click it.
                      setError(
                        cause instanceof Error ? cause.message : "That could not be converted."
                      )
                    }
                  })
                }
              >
                Convert to client
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  startTransition(async () => {
                    await startProjectFromDeal(row.id)
                    router.refresh()
                  })
                }
              >
                Convert to project
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  startTransition(async () => {
                    await archiveDeal(row.id)
                    router.refresh()
                  })
                }
              >
                Archive lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </td>
    </tr>
  )
}
