"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Lock, Plus, Search } from "lucide-react"

import { Pagination } from "@/components/app/pagination"
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
import { pageSlice } from "@/lib/pagination"
import { cn } from "@/lib/utils"

import { addTicketReply, archiveTicket, saveTicket, type TicketInput } from "./actions"

/**
 * The support queue, and one ticket's thread.
 *
 * The filter defaults to the tickets that need us rather than to everything:
 * a queue is a list of things to do, and one that opens showing every closed
 * ticket from the last year is a list nobody reads twice.
 */

export type TicketReplyRow = {
  id: string
  body: string
  fromClient: boolean
  internal: boolean
  authorName: string | null
  whenLabel: string
}

export type TicketViewRow = {
  id: string
  ref: string
  subject: string
  body: string | null
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectTitle: string | null
  status: string
  statusLabel: string
  priority: string
  priorityLabel: string
  channel: string
  assigneeId: string | null
  assigneeName: string | null
  dueAt: string | null
  dueLabel: string | null
  overdue: boolean
  settled: boolean
  createdLabel: string
  ageLabel: string
  firstResponseLabel: string | null
  replies: TicketReplyRow[]
}

export type Option = { id: string; label: string }

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-tone-info-bg text-tone-info",
  IN_PROGRESS: "bg-tone-special-bg text-tone-special",
  WAITING_ON_CLIENT: "bg-tone-warning-bg text-tone-warning",
  RESOLVED: "bg-tone-success-bg text-tone-success",
  CLOSED: "bg-muted text-muted-foreground",
}

const PRIORITY_TONE: Record<string, string> = {
  URGENT: "bg-tone-danger-bg text-tone-danger",
  HIGH: "bg-tone-warning-bg text-tone-warning",
  NORMAL: "text-muted-foreground",
  LOW: "text-muted-foreground",
}

const STATUSES: Option[] = [
  { id: "OPEN", label: "Open" },
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "WAITING_ON_CLIENT", label: "Waiting on client" },
  { id: "RESOLVED", label: "Resolved" },
  { id: "CLOSED", label: "Closed" },
]

const PRIORITIES: Option[] = [
  { id: "URGENT", label: "Urgent" },
  { id: "HIGH", label: "High" },
  { id: "NORMAL", label: "Normal" },
  { id: "LOW", label: "Low" },
]

const CHANNELS: Option[] = [
  { id: "EMAIL", label: "Email" },
  { id: "PHONE", label: "Phone" },
  { id: "WHATSAPP", label: "WhatsApp" },
  { id: "IN_PERSON", label: "In person" },
  { id: "PORTAL", label: "Portal" },
  { id: "OTHER", label: "Other" },
]

type Lens = "needsUs" | "waiting" | "settled" | "all"

const LENSES: { id: Lens; label: string }[] = [
  { id: "needsUs", label: "Needs us" },
  { id: "waiting", label: "Waiting on client" },
  { id: "settled", label: "Settled" },
  { id: "all", label: "All" },
]

function blank(): TicketViewRow {
  return {
    id: "",
    ref: "",
    subject: "",
    body: null,
    clientId: null,
    clientName: null,
    projectId: null,
    projectTitle: null,
    status: "OPEN",
    statusLabel: "Open",
    priority: "NORMAL",
    priorityLabel: "Normal",
    channel: "EMAIL",
    assigneeId: null,
    assigneeName: null,
    dueAt: null,
    dueLabel: null,
    overdue: false,
    settled: false,
    createdLabel: "",
    ageLabel: "",
    firstResponseLabel: null,
    replies: [],
  }
}

function matchesLens(row: TicketViewRow, lens: Lens): boolean {
  if (lens === "all") return true
  if (lens === "waiting") return row.status === "WAITING_ON_CLIENT"
  if (lens === "settled") return row.settled
  return row.status === "OPEN" || row.status === "IN_PROGRESS"
}

export function TicketsView({
  rows,
  clients,
  projects,
  members,
}: {
  rows: TicketViewRow[]
  clients: Option[]
  projects: Option[]
  members: Option[]
}) {
  const [query, setQuery] = useState("")
  const [lens, setLens] = useState<Lens>("needsUs")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [editing, setEditing] = useState<TicketViewRow | null>(null)
  const [open, setOpen] = useState<TicketViewRow | null>(null)

  const counts = useMemo(() => {
    const result = {} as Record<Lens, number>
    for (const { id } of LENSES) result[id] = rows.filter((r) => matchesLens(r, id)).length
    return result
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (!matchesLens(row, lens)) return false
      if (!q) return true
      return [row.ref, row.subject, row.clientName, row.projectTitle, row.assigneeName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    })
  }, [rows, query, lens])

  const visible = pageSlice(filtered, page, pageSize)

  // The open ticket is re-read from `rows` each render, so a reply added in
  // the dialog shows up once the server data comes back rather than leaving a
  // stale copy on screen.
  const openRow = open ? (rows.find((r) => r.id === open.id) ?? null) : null

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.75}
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search tickets"
              aria-label="Search tickets"
              className="h-9 w-56 rounded-lg border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {LENSES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setLens(l.id)
                  setPage(1)
                }}
                aria-pressed={lens === l.id}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  lens === l.id
                    ? "border-ring bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l.label}
                <span className="ml-1.5 tabular-nums opacity-70">{counts[l.id]}</span>
              </button>
            ))}
          </div>
        </div>

        <Button size="sm" onClick={() => setEditing(blank())}>
          <Plus className="mr-1.5 size-4" /> New ticket
        </Button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 font-normal">Ticket</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Client</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Status</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Priority</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Assigned</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Opened</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                onClick={() => setOpen(row)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setOpen(row)
                  }
                }}
                className="cursor-pointer border-b outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <td className="px-4 py-2.5">
                  <span className="block">{row.subject}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.ref}
                    {row.replies.length > 0 &&
                      ` · ${row.replies.length} ${row.replies.length === 1 ? "reply" : "replies"}`}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {row.clientName ?? <span className="text-muted-foreground">—</span>}
                  {row.projectTitle && (
                    <span className="block text-xs text-muted-foreground">{row.projectTitle}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium",
                      STATUS_TONE[row.status] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {row.statusLabel}
                  </span>
                  {row.overdue && (
                    <span className="mt-1 block text-xs text-tone-danger">
                      Reply was due {row.dueLabel}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium",
                      PRIORITY_TONE[row.priority]
                    )}
                  >
                    {row.priorityLabel}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {row.assigneeName ?? (
                    <span className={cn(!row.settled && "text-tone-warning")}>Nobody</span>
                  )}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                  {row.createdLabel}
                  <span className="block text-xs">{row.ageLabel}</span>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "No tickets yet. Raise one when a client reports something."
                    : lens === "needsUs"
                      ? "Nothing is waiting on you."
                      : "Nothing matches that filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <Pagination
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          noun="tickets"
        />
      )}

      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {editing && (
            <TicketForm
              key={editing.id || "new"}
              row={editing}
              clients={clients}
              projects={projects}
              members={members}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={openRow != null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {openRow && (
            <TicketThread
              row={openRow}
              onEdit={() => {
                setOpen(null)
                setEditing(openRow)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function TicketThread({ row, onEdit }: { row: TicketViewRow; onEdit: () => void }) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [internal, setInternal] = useState(false)
  const [fromClient, setFromClient] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const send = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await addTicketReply({ ticketId: row.id, body, fromClient, internal })
        setBody("")
        setInternal(false)
        setFromClient(false)
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not send.")
      }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8">{row.subject}</DialogTitle>
        <DialogDescription>
          {row.ref} · {row.clientName ?? "No client"} · opened {row.createdLabel}
          {row.firstResponseLabel && ` · first reply after ${row.firstResponseLabel}`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium",
            STATUS_TONE[row.status] ?? "bg-muted text-muted-foreground"
          )}
        >
          {row.statusLabel}
        </span>
        <span
          className={cn(
            "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium",
            PRIORITY_TONE[row.priority]
          )}
        >
          {row.priorityLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {row.assigneeName ? `Assigned to ${row.assigneeName}` : "Unassigned"}
        </span>
        <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onEdit}>
          Edit details
        </Button>
      </div>

      <div className="space-y-3">
        {row.body && (
          <article className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="mb-1 text-xs text-muted-foreground">
              Reported {row.createdLabel}
            </p>
            <p className="whitespace-pre-wrap">{row.body}</p>
          </article>
        )}

        {row.replies.map((reply) => (
          <article
            key={reply.id}
            className={cn(
              "rounded-lg border p-3 text-sm",
              reply.internal
                ? // Visibly different, because the cost of mistaking an internal
                  // note for something the client has seen is high.
                  "border-dashed border-tone-warning/40 bg-tone-warning-bg"
                : reply.fromClient
                  ? "bg-muted/40"
                  : "border-ring/30 bg-accent/40"
            )}
          >
            <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {reply.internal && <Lock className="size-3" strokeWidth={2} />}
              <span className="font-medium text-foreground">
                {reply.fromClient ? (row.clientName ?? "Client") : (reply.authorName ?? "Team")}
              </span>
              {reply.internal && <span className="text-tone-warning">internal note</span>}
              <span>· {reply.whenLabel}</span>
            </p>
            <p className="whitespace-pre-wrap">{reply.body}</p>
          </article>
        ))}

        {row.replies.length === 0 && !row.body && (
          <p className="text-sm text-muted-foreground">Nothing recorded on this ticket yet.</p>
        )}
      </div>

      <form onSubmit={send} className="space-y-2 border-t pt-3">
        <Label htmlFor="reply-body" className="sr-only">
          Reply
        </Label>
        <Textarea
          id="reply-body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={internal ? "A note only the team will see..." : "Write a reply..."}
          required
        />

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fromClient}
              onChange={(e) => {
                setFromClient(e.target.checked)
                // A message from the client cannot be an internal note.
                if (e.target.checked) setInternal(false)
              }}
              className="size-4 rounded border-input accent-primary"
            />
            Logging what the client said
          </label>

          <label
            className={cn(
              "flex items-center gap-2 text-sm",
              fromClient && "cursor-not-allowed opacity-50"
            )}
          >
            <input
              type="checkbox"
              checked={internal}
              disabled={fromClient}
              onChange={(e) => setInternal(e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            Internal note
          </label>

          <Button type="submit" size="sm" className="ml-auto" disabled={pending}>
            {pending ? "Saving..." : "Add"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </>
  )
}

function TicketForm({
  row,
  clients,
  projects,
  members,
  onClose,
}: {
  row: TicketViewRow
  clients: Option[]
  projects: Option[]
  members: Option[]
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    subject: row.subject,
    body: row.body ?? "",
    clientId: row.clientId ?? "",
    projectId: row.projectId ?? "",
    status: row.status,
    priority: row.priority,
    channel: row.channel,
    assigneeId: row.assigneeId ?? "",
    dueAt: row.dueAt ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const payload: TicketInput = {
          ...(row.id ? { id: row.id } : {}),
          subject: form.subject,
          body: form.body || null,
          clientId: form.clientId || null,
          projectId: form.projectId || null,
          status: form.status,
          priority: form.priority,
          channel: form.channel,
          assigneeId: form.assigneeId || null,
          dueAt: form.dueAt || null,
        }
        await saveTicket(payload)
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
        <DialogTitle>{row.id ? `Edit ${row.ref}` : "New ticket"}</DialogTitle>
        <DialogDescription>
          What was reported, who it is for, and who is picking it up.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="tkt-subject">Subject</Label>
          <Input
            id="tkt-subject"
            value={form.subject}
            onChange={(e) => set("subject", e.target.value)}
            placeholder="Contact form not sending email"
            required
          />
        </div>

        {!row.id && (
          <div className="space-y-1">
            <Label htmlFor="tkt-body">What was reported</Label>
            <Textarea
              id="tkt-body"
              rows={3}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tkt-client">Client</Label>
            <select
              id="tkt-client"
              value={form.clientId}
              onChange={(e) => set("clientId", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tkt-project">Project</Label>
            <select
              id="tkt-project"
              value={form.projectId}
              onChange={(e) => set("projectId", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Not tied to a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="tkt-status">Status</Label>
            <select
              id="tkt-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tkt-priority">Priority</Label>
            <select
              id="tkt-priority"
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tkt-channel">Came in by</Label>
            <select
              id="tkt-channel"
              value={form.channel}
              onChange={(e) => set("channel", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tkt-assignee">Assigned to</Label>
            <select
              id="tkt-assignee"
              value={form.assigneeId}
              onChange={(e) => set("assigneeId", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tkt-due">Reply promised by</Label>
            <Input
              id="tkt-due"
              type="datetime-local"
              value={form.dueAt}
              onChange={(e) => set("dueAt", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank if nothing was promised.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {row.id ? (
            confirmArchive ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Archive this ticket?</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await archiveTicket(row.id)
                        router.refresh()
                        onClose()
                      } catch {
                        setError("That ticket could not be archived.")
                      }
                    })
                  }
                >
                  Archive
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmArchive(false)}>
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
                Archive
              </Button>
            )
          ) : (
            <span />
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : row.id ? "Save" : "Raise ticket"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
