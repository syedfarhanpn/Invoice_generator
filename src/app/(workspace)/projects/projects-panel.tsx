"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Download, LayoutGrid, List, Search, SlidersHorizontal, Trash2 } from "lucide-react"

import { Pagination } from "@/components/app/pagination"
import { Board, type BoardCard, type BoardColumn } from "@/components/board/board"
import type { ClientOption } from "@/components/workspace/deal-detail"
import {
  ProjectsListView,
  type ProjectRow,
} from "@/components/workspace/projects-list-view"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { describeDue } from "@/lib/dates"
import type { WorkspaceMember } from "@/lib/members"
import { formatMoney } from "@/lib/money"
import { pageSlice } from "@/lib/pagination"
import { cn } from "@/lib/utils"

import { nextResetLabel, withinCurrentWeek } from "@/lib/week-reset"

import {
  archiveProject,
  createProject,
  createProjectWithDetails,
  moveProject,
  updateProject,
} from "./actions"
import {
  ProjectServicesPrompt,
  type ServicesPromptTarget,
} from "./project-services-prompt"

/**
 * One set of projects, drawn two ways.
 *
 * List is the reference's table and the default, because reading across nine
 * columns is what you do most. Board is the drag-and-drop pipeline that was
 * here first and is untouched: it is how a project changes stage, which the
 * list deliberately cannot do - a stage move renumbers a whole column, and a
 * second path into that would let positions drift from what the board shows.
 *
 * The search and the status filter narrow BOTH views, so a count in one can
 * never disagree with the other.
 */

export type ProjectDetailData = {
  id: string
  title: string
  clientId: string | null
  managerId: string | null
  category: string
  progress: string
  value: string
  startedAt: string
  deadline: string
  description: string
  /** Where it came from, when it came from a won deal. Shown, never edited. */
  sourceDealTitle: string | null
}

export type ProjectStage = { id: string; name: string; position: number; type: string }

type View = "list" | "board"

const VIEWS: { key: View; label: string; icon: typeof List }[] = [
  { key: "list", label: "List", icon: List },
  { key: "board", label: "Board", icon: LayoutGrid },
]

export function ProjectsPanel({
  rows,
  stages,
  details,
  clients,
  members,
  currency,
}: {
  rows: ProjectRow[]
  stages: ProjectStage[]
  details: Record<string, ProjectDetailData>
  clients: ClientOption[]
  members: WorkspaceMember[]
  currency: string
}) {
  const [view, setView] = useState<View>("list")
  const [query, setQuery] = useState("")
  const [stageFilter, setStageFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [servicesFor, setServicesFor] = useState<ServicesPromptTarget | null>(null)

  /**
   * Wraps moveProject so a handover can raise the services prompt.
   *
   * The Board only wants a promise that resolves; the extra return value is
   * read here rather than widening the board's contract, which three other
   * screens share.
   */
  const handleMove = async (projectId: string, toStageId: string, toIndex: number) => {
    const result = await moveProject(projectId, toStageId, toIndex)
    if (result.offerServices) setServicesFor(result.offerServices)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (stageFilter !== "all" && row.stageId !== stageFilter) return false
      if (!q) return true
      return [row.title, row.clientName, row.category, row.stageName, row.managerName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    })
  }, [rows, query, stageFilter])

  const columns: BoardColumn[] = useMemo(
    () =>
      stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        type: stage.type as BoardColumn["type"],
        // Said on the column itself, because a card quietly vanishing from a
        // board is otherwise indistinguishable from losing it.
        note: stage.type === "WON" ? `This week only · clears ${nextResetLabel()}` : null,
      })),
    [stages]
  )

  // The board's cards are built from the same filtered rows the list shows,
  // which is what keeps the two views honest with one another.
  const cards: BoardCard[] = useMemo(
    () =>
      filtered
        // The Completed column is a worklist, not an archive. Everything
        // older than Sunday keeps its row in the list view, its money in the
        // figures and its place in reports - it just stops taking up a card.
        // See lib/week-reset.ts for why this is derived rather than scheduled.
        .filter((row) => row.stageType !== "WON" || withinCurrentWeek(row.completedAt))
        .map((row) => {
        const badges: BoardCard["badges"] = []
        if (row.value != null) {
          badges.push({ label: formatMoney(row.value, row.currency || currency), tone: "muted" })
        }
        if (row.category) badges.push({ label: row.category, tone: "info" })
        if (row.progress != null) badges.push({ label: `${row.progress}%`, tone: "success" })
        if (row.deadline) {
          const { label, tone } = describeDue(row.deadline)
          // Only late and today earn the signal colour; everything else is quiet.
          badges.push({
            label,
            tone: tone === "overdue" || tone === "today" ? "danger" : "muted",
          })
        }
        if (row.taskCount > 0) badges.push({ label: `${row.taskCount} tasks`, tone: "muted" })

        return {
          id: row.id,
          stageId: row.stageId,
          title: row.title,
          // Client and manager read together: who it is for, and who owns it.
          subtitle: [row.clientName, row.managerName].filter(Boolean).join(" · ") || null,
          badges,
          done: row.stageType === "WON",
        }
      }),
    [filtered, currency]
  )

  const visible = pageSlice(filtered, page, pageSize)
  const project = editingId ? (details[editingId] ?? null) : null

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div role="group" aria-label="View" className="flex items-center gap-0.5">
          {VIEWS.map((v) => {
            const Icon = v.icon
            return (
              <button
                key={v.key}
                type="button"
                aria-pressed={view === v.key}
                onClick={() => setView(v.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  view === v.key
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
                {v.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
              placeholder="Search projects..."
              aria-label="Search projects"
              className="h-8 w-48 rounded-md border bg-background pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Built from the board's own columns, so renaming a stage renames
              it here too. */}
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
            href="/reports/export?report=projects&range=all"
            download
            aria-label="Export projects as CSV"
            className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-4" strokeWidth={1.75} />
          </a>
        </div>
      </header>

      {view === "board" ? (
        <Board
          columns={columns}
          cards={cards}
          onMove={handleMove}
          onCreate={createProject}
          onRequestCreate={setCreatingIn}
          onOpen={setEditingId}
          addLabel="Add a project"
        />
      ) : filtered.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-sm text-foreground">
            {rows.length === 0 ? "No projects yet" : "Nothing matches that search"}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {rows.length === 0
              ? "Add one above, or win a lead and convert it - the client, value and title carry straight over."
              : "Try a project name, a client, a type or a manager."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ProjectsListView
            rows={visible}
            onOpen={setEditingId}
            startIndex={(page - 1) * pageSize}
          />
          <Pagination
            total={filtered.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            noun="projects"
          />
        </div>
      )}

      <Dialog open={project != null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {project && (
            <ProjectForm
              key={project.id}
              project={project}
              clients={clients}
              members={members}
              onClose={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creatingIn != null} onOpenChange={(open) => !open && setCreatingIn(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {creatingIn && (
            <ProjectForm
              key={`new-${creatingIn}`}
              project={blankProject()}
              createInStage={creatingIn}
              stageName={stages.find((s) => s.id === creatingIn)?.name ?? null}
              clients={clients}
              members={members}
              onClose={() => setCreatingIn(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ProjectServicesPrompt target={servicesFor} onClose={() => setServicesFor(null)} />
    </div>
  )
}

/** An empty project, so the create and edit dialogs share one form. */
function blankProject(): ProjectDetailData {
  return {
    id: "",
    title: "",
    clientId: null,
    managerId: null,
    category: "",
    progress: "",
    value: "",
    startedAt: new Date().toISOString().slice(0, 10),
    deadline: "",
    description: "",
    sourceDealTitle: null,
  }
}

/**
 * One form, two jobs.
 *
 * Create and edit ask for exactly the same facts, so forking them would mean
 * two places to add the next field to and one of them being forgotten. The
 * only difference is which action runs and what the heading says.
 */
function ProjectForm({
  project,
  createInStage,
  stageName,
  clients,
  members,
  onClose,
}: {
  project: ProjectDetailData
  /** Set when this is a new project, naming the column it lands in. */
  createInStage?: string
  stageName?: string | null
  clients: ClientOption[]
  members: WorkspaceMember[]
  onClose: () => void
}) {
  const isNew = createInStage != null
  const [title, setTitle] = useState(project.title)
  const [clientId, setClientId] = useState(project.clientId ?? "")
  const [managerId, setManagerId] = useState(project.managerId ?? "")
  const [category, setCategory] = useState(project.category)
  const [progress, setProgress] = useState(project.progress)
  const [value, setValue] = useState(project.value)
  const [startedAt, setStartedAt] = useState(project.startedAt)
  const [deadline, setDeadline] = useState(project.deadline)
  const [description, setDescription] = useState(project.description)
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const fields = {
          title,
          clientId: clientId || null,
          managerId: managerId || null,
          category: category || null,
          progress: progress || null,
          value: value || null,
          startedAt: startedAt || null,
          deadline: deadline || null,
          description: description || null,
        }
        if (createInStage) {
          await createProjectWithDetails({ stageId: createInStage, ...fields })
        } else {
          await updateProject({ projectId: project.id, ...fields })
        }
        // revalidatePath clears the server cache; the client router still
        // holds its own copy for staleTimes.dynamic seconds. This is what
        // actually re-pulls the page.
        router.refresh()
        onClose()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not save.")
      }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? "Add a project" : "Edit project"}</DialogTitle>
        <DialogDescription>
          {isNew
            ? `It starts in ${stageName ?? "this column"}. Fill in what you know - everything here can be changed later.`
            : project.sourceDealTitle
              ? `Started from the deal "${project.sourceDealTitle}". Drag the card on the board to change its stage.`
              : "Drag the card on the board to change its stage."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="project-title">Title</Label>
          <Input
            id="project-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="project-client">Client</Label>
            <select
              id="project-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No client yet</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="project-value">Value</Label>
            <Input
              id="project-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="25000"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="project-manager">Project manager</Label>
            <select
              id="project-manager"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="project-category">Type</Label>
            <Input
              id="project-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="E-commerce, Portfolio, AMC..."
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="project-started">Start date</Label>
            <Input
              id="project-started"
              type="date"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Left empty, the list shows when the card was made.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="project-deadline">End date</Label>
            <Input
              id="project-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Shows on the calendar and on the card.</p>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="project-progress">Progress</Label>
          <div className="flex items-center gap-3">
            <input
              id="project-progress"
              type="range"
              min={0}
              max={100}
              step={5}
              value={progress === "" ? 0 : Number(progress)}
              onChange={(e) => setProgress(e.target.value)}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
            <span className="w-12 shrink-0 text-right text-sm tabular-nums">
              {progress === "" ? "-" : `${progress}%`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Your judgement of how far along this is. Task counts are shown on the row beside it.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="project-notes">Notes</Label>
          <Textarea
            id="project-notes"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Scope, what is agreed, anything the next person would need."
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {isNew ? (
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          ) : confirmArchive ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Archive this project?</span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await archiveProject(project.id)
                      router.refresh()
                      onClose()
                    } catch {
                      setError("That project could not be archived.")
                    }
                  })
                }
              >
                Archive
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmArchive(false)}
              >
                Keep
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setConfirmArchive(true)}
            >
              <Trash2 className="mr-1.5 size-4" /> Archive
            </Button>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : isNew ? "Add project" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
