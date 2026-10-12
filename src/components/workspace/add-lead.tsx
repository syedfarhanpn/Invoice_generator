"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { createDeal } from "@/app/(workspace)/crm/actions"
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

export type LeadStage = { id: string; name: string; position: number }

/**
 * The reference's "+ Add Lead", in the page header where it puts it.
 *
 * It asks for one thing - what the lead is after - and drops the row into the
 * first column of the board. Everything else is filled in by opening the lead
 * afterwards. A long form here would be a worse version of the detail panel
 * that already exists.
 */
export function AddLead({ stages }: { stages: LeadStage[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The first column by position: where a new lead belongs on any board,
  // whatever the operator has renamed their columns to.
  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0]

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={!firstStage}>
        <Plus className="mr-1.5 size-4" /> Add Lead
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a lead</DialogTitle>
            <DialogDescription>
              It starts in {firstStage?.name ?? "the first column"}. Open it afterwards to add the
              client, the value and a next action.
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
                  await createDeal(firstStage.id, title)
                  setTitle("")
                  setOpen(false)
                  router.refresh()
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "That lead could not be added.")
                }
              })
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-lead">What are they after?</Label>
              <Input
                id="new-lead"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Portfolio website for Acme"
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
                {pending ? "Adding..." : "Add lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
