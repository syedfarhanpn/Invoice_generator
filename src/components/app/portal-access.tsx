"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CircleCheck, Mail, UserRound } from "lucide-react"

import { invitePortalClient, revokePortalAccess } from "@/app/dashboard/clients/actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { InviteOutcome } from "@/lib/invites"

/**
 * Portal access for one client.
 *
 * Three states, and they are genuinely different things to say:
 *   - no access at all
 *   - invited, waiting for them to set a password
 *   - signed in and using it
 *
 * The middle one matters: an operator who sees "invited" and nothing since
 * needs to know whether to chase, and conflating it with "active" is how a
 * client sits locked out for a fortnight while everyone assumes it works.
 */
export function PortalAccess({
  clientId,
  clientEmail,
  invitedOn,
  activeSince,
}: {
  clientId: string
  clientEmail: string
  /** Pre-formatted on the server - this renders no dates itself. */
  invitedOn: string | null
  activeSince: string | null
}) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [showNote, setShowNote] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  const hasEmail = Boolean(clientEmail?.trim())

  const run = (work: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null)
      try {
        await work()
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not work.")
      }
    })

  const invite = () =>
    startTransition(async () => {
      setError(null)
      setOutcome(null)
      try {
        const result = await invitePortalClient(clientId, note || null)
        router.refresh()
        setShowNote(false)
        setNote("")
        // Only surface the panel when something needs saying - on a clean
        // send the refreshed status line already tells the story.
        if (!result.emailed) setOutcome(result)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not work.")
      }
    })

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UserRound className="size-4 text-muted-foreground" strokeWidth={1.75} />
          Client portal
        </h2>
        {activeSince ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-tone-success-bg px-2 py-0.5 text-xs font-medium text-tone-success">
            <CircleCheck className="size-3.5" strokeWidth={2} /> Active since {activeSince}
          </span>
        ) : invitedOn ? (
          <span className="rounded-md bg-tone-warning-bg px-2 py-0.5 text-xs font-medium text-tone-warning">
            Invited {invitedOn} · not signed in yet
          </span>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        {activeSince
          ? `${clientEmail} can sign in and follow their projects, invoices and renewals.`
          : invitedOn
            ? `${clientEmail} has been sent a link to set a password. Nothing is visible to them until they do.`
            : "Give this client their own sign-in to follow their projects, invoices and renewals. They see only their own work."}
      </p>

      {!hasEmail && (
        <p className="mt-2 text-sm text-tone-warning">
          Add an email address for this client before inviting them.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {outcome && (
        <div className="mt-3 space-y-2 rounded-lg border p-3">
          <p className="text-sm text-muted-foreground">{outcome.problem}</p>
          {outcome.actionUrl && (
            <>
              <Label htmlFor="portal-link" className="text-xs">
                Their sign-in link
              </Label>
              <textarea
                id="portal-link"
                readOnly
                rows={2}
                value={outcome.actionUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full resize-none rounded-md border bg-muted/40 p-2 font-mono text-xs break-all outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(outcome.actionUrl!)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </Button>
            </>
          )}
        </div>
      )}

      {showNote && (
        <div className="mt-3 space-y-1">
          <Label htmlFor="portal-note">Add a note (optional)</Label>
          <Textarea
            id="portal-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything you want them to read before they sign in."
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !hasEmail} onClick={invite}>
          <Mail className="mr-1.5 size-4" />
          {pending
            ? "Sending..."
            : activeSince || invitedOn
              ? "Send invitation again"
              : "Invite to portal"}
        </Button>

        {!showNote && hasEmail && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setShowNote(true)}
          >
            Add a note
          </Button>
        )}

        {(activeSince || invitedOn) &&
          (confirmOff ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Remove their access?</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => revokePortalAccess(clientId))}
              >
                Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)}>
                Keep
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setConfirmOff(true)}
            >
              Remove access
            </Button>
          ))}
      </div>
    </section>
  )
}
