"use client"

import { useState, useTransition } from "react"

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

import type { TaskDetail } from "./page"
import { createTask, moveTask, scheduleTask } from "./actions"

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
}: {
  columns: BoardColumn[]
  cards: BoardCard[]
  details: Record<string, TaskDetail>
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const task = openId ? details[openId] : null

  return (
    <>
      <Board
        columns={columns}
        cards={cards}
        onMove={moveTask}
        onCreate={createTask}
        onOpen={setOpenId}
        addLabel="Add a task"
      />

      <Dialog open={task != null} onOpenChange={(open) => !open && setOpenId(null)}>
        <DialogContent>
          {task && <ScheduleForm task={task} onDone={() => setOpenId(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ScheduleForm({ task, onDone }: { task: TaskDetail; onDone: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [dueAt, setDueAt] = useState(task.dueAtLocal)
  const [remindAt, setRemindAt] = useState(task.remindAtLocal)
  const [priority, setPriority] = useState(task.priority)
  const [notes, setNotes] = useState(task.notes ?? "")
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
          dueAt: dueAt || null,
          remindAt: remindAt || null,
          priority,
          notes,
        })
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

        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
