"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"

import { Board, type BoardCard, type BoardColumn } from "@/components/board/board"
import type { ClientOption } from "@/components/workspace/deal-detail"
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

import { archiveProject, createProject, moveProject, updateProject } from "./actions"

export type ProjectDetailData = {
  id: string
  title: string
  clientId: string | null
  value: string
  deadline: string
  description: string
  /** Where it came from, when it came from a won deal. Shown, never edited. */
  sourceDealTitle: string | null
}

/** The projects board plus its editor, wired the same way the CRM is. */
export function ProjectsBoard({
  columns,
  cards,
  details,
  clients,
}: {
  columns: BoardColumn[]
  cards: BoardCard[]
  details: Record<string, ProjectDetailData>
  clients: ClientOption[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const project = editingId ? (details[editingId] ?? null) : null

  return (
    <>
      <Board
        columns={columns}
        cards={cards}
        onMove={moveProject}
        onCreate={createProject}
        onOpen={setEditingId}
        addLabel="Add a project"
      />

      <Dialog open={project != null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {project && (
            <ProjectForm
              key={project.id}
              project={project}
              clients={clients}
              onClose={() => setEditingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ProjectForm({
  project,
  clients,
  onClose,
}: {
  project: ProjectDetailData
  clients: ClientOption[]
  onClose: () => void
}) {
  const [title, setTitle] = useState(project.title)
  const [clientId, setClientId] = useState(project.clientId ?? "")
  const [value, setValue] = useState(project.value)
  const [deadline, setDeadline] = useState(project.deadline)
  const [description, setDescription] = useState(project.description)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await updateProject({
          projectId: project.id,
          title,
          clientId: clientId || null,
          value: value || null,
          deadline: deadline || null,
          description: description || null,
        })
        onClose()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not save.")
      }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit project</DialogTitle>
        <DialogDescription>
          {project.sourceDealTitle
            ? `Started from the deal "${project.sourceDealTitle}". Drag the card to change its stage.`
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

        <div className="space-y-1">
          <Label htmlFor="project-deadline">Deadline</Label>
          <Input
            id="project-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Shows on the calendar and on the card.</p>
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
          {confirmArchive ? (
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
                      onClose()
                    } catch {
                      setError("That project could not be archived.")
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
              <Trash2 className="mr-1.5 size-4" /> Archive
            </Button>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
