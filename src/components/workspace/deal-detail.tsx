"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"

import { archiveDeal, setNextAction, updateDeal } from "@/app/(workspace)/crm/actions"
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

/**
 * Editing a lead.
 *
 * Its stage is deliberately absent: moving a deal also renumbers a column and
 * writes to the activity trail, so the board is the only place that does it.
 * A dropdown here that skipped both would quietly produce a different result
 * from dragging the same card.
 */

export type DealDetailData = {
  id: string
  title: string
  clientId: string | null
  value: string
  source: string
  expectedCloseDate: string
  description: string
  nextActionTitle: string
  nextActionDue: string
}

export type ClientOption = { id: string; label: string }

export function DealDetail({
  deal,
  clients,
  onClose,
}: {
  deal: DealDetailData | null
  clients: ClientOption[]
  onClose: () => void
}) {
  return (
    <Dialog open={deal != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        {deal && <DealForm key={deal.id} deal={deal} clients={clients} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function DealForm({
  deal,
  clients,
  onClose,
}: {
  deal: DealDetailData
  clients: ClientOption[]
  onClose: () => void
}) {
  const [title, setTitle] = useState(deal.title)
  const [clientId, setClientId] = useState(deal.clientId ?? "")
  const [value, setValue] = useState(deal.value)
  const [source, setSource] = useState(deal.source)
  const [closeDate, setCloseDate] = useState(deal.expectedCloseDate)
  const [description, setDescription] = useState(deal.description)
  const [actionTitle, setActionTitle] = useState(deal.nextActionTitle)
  const [actionDue, setActionDue] = useState(deal.nextActionDue)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        // Two writes, because the next action is a task rather than a column
        // on the deal. The deal saves first, so a failure in the task does not
        // silently discard the rest of the form.
        await updateDeal({
          dealId: deal.id,
          title,
          clientId: clientId || null,
          value: value || null,
          source: source || null,
          expectedCloseDate: closeDate || null,
          description: description || null,
        })
        if (actionTitle !== deal.nextActionTitle || actionDue !== deal.nextActionDue) {
          await setNextAction(deal.id, actionTitle, actionDue || null)
        }
        onClose()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not save.")
      }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit lead</DialogTitle>
        <DialogDescription>
          Drag the card on the board to change its stage.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="deal-title">Name</Label>
          <Input
            id="deal-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="deal-client">Client</Label>
            <select
              id="deal-client"
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
            <Label htmlFor="deal-value">Value</Label>
            <Input
              id="deal-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="25000"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="deal-source">Source</Label>
            <Input
              id="deal-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Referral, Meta ad, website form..."
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="deal-close">Expected close</Label>
            <Input
              id="deal-close"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-sm font-medium">Next action</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The one thing you will do next. Clearing the title closes it.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              aria-label="Next action"
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              placeholder="Call back, send proposal..."
            />
            <Input
              aria-label="Next action due date"
              type="date"
              value={actionDue}
              onChange={(e) => setActionDue(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="deal-notes">Notes</Label>
          <Textarea
            id="deal-notes"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What they asked for, what you quoted, anything worth remembering."
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {confirmArchive ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Archive this lead?</span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await archiveDeal(deal.id)
                      onClose()
                    } catch {
                      setError("That lead could not be archived.")
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
