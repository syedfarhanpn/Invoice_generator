"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import { Board, type BoardCard, type BoardColumn } from "@/components/board/board"
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
import type { WorkspaceMember } from "@/lib/members"

import type { TaskDetail } from "./page"
import { createTask, deleteTask, moveTask, scheduleTask } from "./actions"

/**
 * The tasks board plus the panel that gives a card its date and time.
 *
 * Scheduling lives behind a click rather than in the card composer: adding a
 * task should cost one line of typing, and most of them never need a time at
 * all. The ones that do are the ones you open.
 */
export function TasksBoard({
  columns,
  cards,
  details,
  members,
}: {
  columns: BoardColumn[]
  cards: BoardCard[]
  details: Record<string, TaskDetail>
  members: WorkspaceMember[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const task = openId ? details[openId] : null

  // Tasks deleted on this screen, hidden before the server has confirmed it.
  // Filtering here rather than inside the board: a new `cards` array is what
  // the board already treats as fresh server data, so the card leaves the
  // same way a revalidation would remove it. Ids are never taken back out on
  // success - a deleted id cannot reappear, so there is nothing to undo.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [, startDelete] = useTransition()

  const visibleCards = useMemo(
    () => (removed.size > 0 ? cards.filter((card) => !removed.has(card.id)) : cards),
    [cards, removed]
  )

  const remove = (taskId: string) => {
    setOpenId(null)
    setDeleteError(null)
    setRemoved((prev) => new Set(prev).add(taskId))
    startDelete(async () => {
      try {
        await deleteTask(taskId)
      } catch {
        // Put it back: the card has to reflect what is actually saved.
        setRemoved((prev) => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
        setDeleteError("That task could not be deleted. It has been put back.")
      }
    })
  }

  return (
    <>
      {deleteError && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-lg bg-tone-danger-bg px-3 py-2 text-sm text-tone-danger"
        >
          {deleteError}
        </div>
      )}

      <Board
        columns={columns}
        cards={visibleCards}
        onMove={moveTask}
        onCreate={createTask}
        onOpen={setOpenId}
        addLabel="Add a task"
      />

      <Dialog open={task != null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent>
          {task && (
            <ScheduleForm
              key={task.id}
              task={task}
              members={members}
              onDone={() => setOpenId(null)}
              onDelete={() => remove(task.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ScheduleForm({
  task,
  members,
  onDone,
  onDelete,
}: {
  task: TaskDetail
  members: WorkspaceMember[]
  onDone: () => void
  onDelete: () => void
}) {
  // Two clicks, both inside the dialog. A native confirm() stacked on top of
  // a modal is a second modal, and for a to-do item that is more ceremony
  // than the decision deserves - but one stray click should not erase it.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "")
  const [dueAt, setDueAt] = useState(task.dueAtLocal)
  const [remindAt, setRemindAt] = useState(task.remindAtLocal)
  const [priority, setPriority] = useState(task.priority)
  const [notes, setNotes] = useState(task.notes ?? "")
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await scheduleTask({
          taskId: task.id,
          title,
          assigneeId: assigneeId || null,
          dueAt: dueAt || null,
          remindAt: remindAt || null,
          priority,
          notes,
        })
        router.refresh()
        onDone()
      } catch {
        setError("That did not save. Nothing has been changed.")
      }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit task</DialogTitle>
        <DialogDescription>
          {task.projectTitle
            ? `Part of ${task.projectTitle}`
            : "Set when this is due and when to be reminded."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="task-title">Title</Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="task-due">Due</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="task-remind">Remind me</Label>
            <Input
              id="task-remind"
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Both are read in your own time. Leave the reminder empty to be told when it falls due.
        </p>

        <div className="space-y-1">
          <Label htmlFor="task-assignee">Assigned to</Label>
          <select
            id="task-assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <Label htmlFor="task-priority">Priority</Label>
          <select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskDetail["priority"])}
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="task-notes">Notes</Label>
          <Textarea
            id="task-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you need in front of you when you pick this up."
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="sm:justify-between">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Delete this task?</span>
              <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
                Delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1.5 size-4" strokeWidth={1.75} aria-hidden />
              Delete
            </Button>
          )}
          <Button type="submit" disabled={pending || confirmingDelete}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
