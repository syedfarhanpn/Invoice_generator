"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { createProject } from "@/app/(workspace)/projects/actions"
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

export type ProjectStageOption = { id: string; name: string; position: number }

/**
 * The reference's "+ Add Project", in the page header where it puts it.
 *
 * It asks for the title and nothing else, and drops the row into the first
 * column of the board. The client, value, manager and dates are filled in by
 * opening the project afterwards - a long form here would be a worse copy of
 * the editor that already exists.
 */
export function AddProject({ stages }: { stages: ProjectStageOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The first column by position: where new work belongs on any board,
  // whatever the operator has renamed their columns to.
  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0]

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!firstStage}>
        <Plus className="mr-1.5 size-4" /> Add Project
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a project</DialogTitle>
            <DialogDescription>
              It starts in {firstStage?.name ?? "the first column"}. Open it afterwards to set the
              client, the manager, the value and the dates.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!firstStage) return
              setError(null)
              startTransition(async () => {
                try {
                  await createProject(firstStage.id, title)
                  setTitle("")
                  setOpen(false)
                  router.refresh()
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "That project could not be added."
                  )
                }
              })
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-project">What is the work?</Label>
              <Input
                id="new-project"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Rasoi Studio website"
                required
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding..." : "Add project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
