"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  clientDeletionWarnings,
  confirmationMatches,
  describeClientImpact,
} from "@/lib/client-deletion"
import {
  deleteClient,
  getClientDeletionImpact,
  type ClientDeletionTarget,
} from "@/app/dashboard/clients/actions"

/**
 * Deleting a client, for administrators.
 *
 * Shown only to an owner or admin, and the server refuses anyone else
 * regardless - see assertWorkspaceAdmin() in the action. Hiding the card is
 * about not offering what cannot be done, not about enforcing it.
 *
 * The dialog reads the counts from the server when it opens rather than
 * receiving them with the page. A page left open on another tab for an hour
 * would otherwise claim "2 documents" while four exist, and the one moment
 * that number has to be right is the moment someone is deciding.
 *
 * Archive is offered inside the dialog too, because it is nearly always the
 * answer: it hides the client, keeps their invoices, and can be undone.
 */
export function DeleteClient({
  clientId,
  clientName,
  archived,
}: {
  clientId: string
  clientName: string
  archived: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<ClientDeletionTarget | null>(null)
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const [deleting, startDeleting] = useTransition()

  function openDialog() {
    setOpen(true)
    setTyped("")
    setError(null)
    setTarget(null)
    startLoading(async () => {
      try {
        setTarget(await getClientDeletionImpact(clientId))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not read what is attached.")
      }
    })
  }

  function confirm() {
    if (!target || !confirmationMatches(typed, target.code)) return
    setError(null)
    startDeleting(async () => {
      try {
        await deleteClient(clientId, typed)
        // Pushed rather than refreshed: this page is about a client who no
        // longer exists, and refreshing it would land on a 404.
        router.push("/dashboard/clients")
      } catch (err) {
        setError(err instanceof Error ? err.message : "That client could not be deleted.")
      }
    })
  }

  const lines = target ? describeClientImpact(target.impact) : []
  const warnings = target ? clientDeletionWarnings(target.impact) : []
  const ready = target != null && confirmationMatches(typed, target.code)

  return (
    <>
      <Card id="delete-client" className="border-destructive/35 scroll-mt-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" strokeWidth={2} aria-hidden />
            Delete this client
          </CardTitle>
          <CardDescription>
            Removes {clientName} and everything filed under them - documents, projects, tasks,
            renewals, tickets and leads. Expenses are kept. This cannot be undone
            {archived
              ? ", and an archived client is already out of every list and report."
              : " - Archive, above, hides them without destroying anything."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={openDialog}>
            <Trash2 className="mr-1.5 size-4" strokeWidth={1.75} aria-hidden />
            Delete client...
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {clientName}?</DialogTitle>
            <DialogDescription>
              {loading
                ? "Counting what is attached..."
                : lines.length > 0
                  ? "This permanently removes the client and the records below."
                  : "Nothing else is filed under this client."}
            </DialogDescription>
          </DialogHeader>

          {lines.length > 0 && (
            <ul className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
              {lines.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden className="text-muted-foreground">
                    &bull;
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          )}

          {warnings.map((warning) => (
            <p key={warning} className="text-sm text-muted-foreground">
              {warning}
            </p>
          ))}

          {target && (
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                Type{" "}
                <span className="font-mono font-semibold text-foreground">{target.code}</span> to
                confirm
              </Label>
              <Input
                id="delete-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={target.code}
                className="max-w-40 font-mono"
                disabled={deleting}
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!ready || deleting}
              onClick={confirm}
            >
              {deleting ? "Deleting..." : lines.length > 0 ? "Delete everything" : "Delete client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
