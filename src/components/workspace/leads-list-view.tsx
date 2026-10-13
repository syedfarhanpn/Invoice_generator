"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Mail, MoreHorizontal, Phone } from "lucide-react"

import { archiveDeal, convertDealToClient } from "@/app/(workspace)/crm/actions"
import { startProjectFromDeal } from "@/app/(workspace)/projects/actions"
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

export function LeadsListView({
  rows,
  onOpen,
  startIndex,
}: {
  rows: DealRow[]
  onOpen: (id: string) => void
  /** Where this page begins, so the # column counts across pages. */
  startIndex: number
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
          <th scope="col" className="w-10 px-4 py-2.5 font-normal">#</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Name</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Company</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Source</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Service Interested</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Assigned To</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Last Contact</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Next Follow-up</th>
          <th scope="col" className="px-4 py-2.5 text-right font-normal">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <LeadRow key={row.id} row={row} index={startIndex + i} onOpen={onOpen} />
        ))}
      </tbody>
    </table>
  )
}

function LeadRow({
  row,
  index,
  onOpen,
}: {
  row: DealRow
  index: number
  onOpen: (id: string) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const name = row.contactName || row.clientName || row.title

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
        "cursor-pointer border-b transition-colors outline-none",
        "hover:bg-accent/50 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        pending && "opacity-60"
      )}
    >
      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
        {String(index + 1).padStart(2, "0")}
      </td>

      <td className="px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Avatar name={name} />
          <span className="truncate font-medium">{name}</span>
        </span>
        {error && <span className="mt-0.5 block text-xs text-destructive">{error}</span>}
      </td>

      <td className="px-3 py-2.5 text-muted-foreground">{row.clientName ?? "—"}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{row.source ?? "Not recorded"}</td>
      <td className="px-3 py-2.5 text-muted-foreground">
        <span className="block max-w-48 truncate" title={row.title}>
          {row.title}
        </span>
      </td>

      <td className="px-3 py-2.5">
        <span
          className={cn(
            "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            stageTone(row)
          )}
        >
          {row.stageName}
        </span>
      </td>

      <td className="px-3 py-2.5">
        {row.assigneeName ? (
          <span className="flex items-center gap-2">
            <Avatar name={row.assigneeName} />
            <span className="truncate text-muted-foreground">
              {row.assigneeName.split(/\s+/)[0]}
            </span>
          </span>
        ) : (
          <span className="text-tone-warning">Unassigned</span>
        )}
      </td>

      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
        {formatDay(row.lastContactAt)}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
        {formatDay(row.nextTaskDueAt)}
      </td>

      {/* The row opens the lead, so every control here stops propagation. */}
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <span className="flex items-center justify-end gap-1">
          {row.contactPhone && (
            <a
              href={`tel:${row.contactPhone}`}
              aria-label={`Call ${name}`}
              className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Phone className="size-3.5" strokeWidth={1.75} />
            </a>
          )}
          {row.contactEmail && (
            <a
              href={`mailto:${row.contactEmail}`}
              aria-label={`Email ${name}`}
              className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Mail className="size-3.5" strokeWidth={1.75} />
            </a>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${name}`}
              className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
