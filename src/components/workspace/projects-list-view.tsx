"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"

import { archiveProject } from "@/app/(workspace)/projects/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { memberInitials } from "@/lib/member-names"
import { formatTableDay } from "@/lib/dates"
import { cn } from "@/lib/utils"

/**
 * Projects as a list, laid out as the reference dashboard.
 *
 * The board is the other half of this: the same rows, drawn as columns you
 * can drag between. Neither is a summary of the other, so a project cannot be
 * in one stage here and another there - both read the same `stageId`.
 *
 * Status is the board column's own name rather than a fixed vocabulary.
 * Planning, In Review, On Hold and the rest are whatever the operator called
 * their columns in Preferences, which is the only definition of "status" this
 * product has.
 */

export type ProjectRow = {
  id: string
  title: string
  clientId: string | null
  clientName: string | null
  /** Free text: "E-commerce", "AMC". Null when nobody recorded one. */
  category: string | null
  stageId: string
  stageName: string
  stageType: "OPEN" | "WON" | "LOST"
  stagePosition: number
  /** ISO. When the card last moved - the closest thing to a completion date,
   *  and what decides whether a finished project is still on the board. */
  completedAt: string
  managerName: string | null
  /** ISO. The recorded start, falling back to when the card was made. */
  startedAt: string
  /** ISO, or null when no deadline was set. */
  deadline: string | null
  progress: number | null
  value: number | null
  currency: string
  openTasks: number
  taskCount: number
}

/** "10 Oct 2026", shared with every other list in the product. */
const formatDay = formatTableDay

/**
 * A pill colour per stage.
 *
 * Delivered and dropped are fixed, because those two always mean the same
 * thing. The open stages cycle a small palette by board position, so a
 * five-column pipeline reads as a progression rather than five identical
 * chips - and renaming or reordering columns keeps a sensible spread without
 * configuring anything. Same rule as the leads table, deliberately.
 */
const OPEN_TONES = [
  "bg-tone-info-bg text-tone-info",
  "bg-tone-special-bg text-tone-special",
  "bg-tone-warning-bg text-tone-warning",
  "bg-chart-1/10 text-chart-1",
]

function stageTone(row: ProjectRow): string {
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

/** The reference's progress column: a track, a fill and the number. */
function Progress({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-xs text-muted-foreground">Not set</span>
  }
  const clamped = Math.min(Math.max(value, 0), 100)
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${clamped}% complete`}
      >
        <span
          className="block h-full rounded-full bg-chart-1"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {clamped}%
      </span>
    </span>
  )
}

export function ProjectsListView({
  rows,
  onOpen,
  startIndex,
}: {
  rows: ProjectRow[]
  onOpen: (id: string) => void
  /** Where this page begins, so the S.No column counts across pages. */
  startIndex: number
}) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
          <th scope="col" className="w-14 px-4 py-2.5 font-normal">S.No</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Project Name</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Client</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Type</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Project Manager</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Start Date</th>
          <th scope="col" className="px-3 py-2.5 font-normal">End Date</th>
          <th scope="col" className="px-3 py-2.5 font-normal">Progress</th>
          <th scope="col" className="px-4 py-2.5 text-right font-normal">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <ProjectListRow key={row.id} row={row} index={startIndex + i} onOpen={onOpen} />
        ))}
      </tbody>
    </table>
  )
}

function ProjectListRow({
  row,
  index,
  onOpen,
}: {
  row: ProjectRow
  index: number
  onOpen: (id: string) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Past its deadline and not finished. The only red on the row, because it
  // is the only thing on it that needs a decision today.
  const late =
    row.stageType === "OPEN" && row.deadline != null && new Date(row.deadline) < new Date()

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
      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{index + 1}</td>

      <td className="px-3 py-2.5">
        <span className="block max-w-56 truncate font-medium" title={row.title}>
          {row.title}
        </span>
        {row.taskCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {row.openTasks} of {row.taskCount} task{row.taskCount === 1 ? "" : "s"} open
          </span>
        )}
      </td>

      <td className="px-3 py-2.5 text-muted-foreground">
        <span className="block max-w-40 truncate">{row.clientName ?? "No client yet"}</span>
      </td>

      <td className="px-3 py-2.5">
        {row.category ? (
          <span className="inline-flex rounded-md bg-tone-info-bg px-2 py-0.5 text-xs font-medium whitespace-nowrap text-tone-info">
            {row.category}
          </span>
        ) : (
          <span className="text-muted-foreground">Not recorded</span>
        )}
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
        {row.managerName ? (
          <span className="flex items-center gap-2">
            <Avatar name={row.managerName} />
            <span className="truncate text-muted-foreground">
              {row.managerName.split(/\s+/)[0]}
            </span>
          </span>
        ) : (
          <span className="text-tone-warning">Unassigned</span>
        )}
      </td>

      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
        {formatDay(row.startedAt)}
      </td>
      <td
        className={cn(
          "px-3 py-2.5 whitespace-nowrap",
          late ? "text-tone-danger" : "text-muted-foreground"
        )}
      >
        {formatDay(row.deadline)}
      </td>

      <td className="px-3 py-2.5">
        <Progress value={row.progress} />
      </td>

      {/* The row opens the project, so every control here stops propagation. */}
      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
        <span className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${row.title}`}
              className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpen(row.id)}>
                Edit project
              </DropdownMenuItem>
              {/* Only when there is one. A menu entry that opens nothing is
                  worse than a shorter menu. */}
              {row.clientId && (
                <DropdownMenuItem
                  onClick={() => router.push(`/dashboard/clients/${row.clientId}`)}
                >
                  Open client
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={() =>
                  startTransition(async () => {
                    await archiveProject(row.id)
                    router.refresh()
                  })
                }
              >
                Archive project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </td>
    </tr>
  )
}
