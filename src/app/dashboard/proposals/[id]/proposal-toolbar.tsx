"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ProposalStatus } from "@prisma/client"
import { ChevronDown, CircleAlert, Download, FilePlus2, Pencil, Sparkles, Trash2 } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

import { deleteProposal, reviseProposal, setProposalStatus } from "../actions"
import { PROPOSAL_STATUS_LABEL } from "../status"

const STATUSES: ProposalStatus[] = ["DRAFT", "SENT", "ACCEPTED", "DECLINED"]

const SUGGESTIONS = [
  "Make the payment schedule 50% advance and 50% at go-live",
  "Add an Arabic language option to the scope",
  "Shorten the scope to the essentials",
]

export function ProposalToolbar({
  proposalId,
  refNumber,
  clientId,
  status,
  canWrite,
}: {
  proposalId: string
  refNumber: string
  clientId: string
  status: ProposalStatus
  canWrite: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reviseOpen, setReviseOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function changeStatus(next: ProposalStatus) {
    setError(null)
    startTransition(async () => {
      const result = await setProposalStatus(proposalId, next)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <a
          href={`/dashboard/proposals/${proposalId}/pdf`}
          className={buttonVariants({ size: "sm" })}
          download={`${refNumber}.pdf`}
        >
          <Download className="mr-1.5 size-4" /> Download PDF
        </a>

        {canWrite && (
          <>
            <Button size="sm" variant="outline" onClick={() => setReviseOpen(true)}>
              <Sparkles className="mr-1.5 size-4" /> Revise with Claude
            </Button>
            <Link href={`/dashboard/proposals/${proposalId}/edit`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              <Pencil className="mr-1.5 size-4" /> Edit details
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger className={buttonVariants({ size: "sm", variant: "outline" })} disabled={pending}>
                {pending ? <Spinner className="mr-1.5" label="Updating" /> : null}
                Status: {PROPOSAL_STATUS_LABEL[status]}
                <ChevronDown className="ml-1 size-4 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUSES.filter((s) => s !== status).map((s) => (
                  <DropdownMenuItem key={s} onClick={() => changeStatus(s)}>
                    Mark as {PROPOSAL_STATUS_LABEL[s].toLowerCase()}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {/* Same client, so the invoice is INV-{code}-001 to this PROP-{code}. */}
                <DropdownMenuItem onClick={() => router.push(`/dashboard/documents/new?client=${clientId}`)}>
                  <FilePlus2 /> Create invoice or quotation
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete proposal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert className="size-4" /> {error}
        </p>
      )}

      {reviseOpen && <ReviseDialog proposalId={proposalId} onOpenChange={setReviseOpen} />}
      {deleteOpen && <DeleteDialog proposalId={proposalId} refNumber={refNumber} onOpenChange={setDeleteOpen} />}
    </div>
  )
}

function ReviseDialog({ proposalId, onOpenChange }: { proposalId: string; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const [change, setChange] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!pending) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [pending])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setElapsed(0)
    startTransition(async () => {
      const result = await reviseProposal(proposalId, change)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    // Not dismissable mid-write: closing would hide the progress, not stop it.
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Revise with Claude</DialogTitle>
          <DialogDescription>
            Say what should change. Claude rewrites the proposal and keeps the rest; the price and payment amounts stay
            as set in Edit details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Textarea
            value={change}
            onChange={(e) => setChange(e.target.value)}
            rows={4}
            autoFocus
            disabled={pending}
            placeholder="e.g. Move the inventory module to phase two and shorten the timeline to 25 days of development"
          />
          {!change && !pending && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setChange(s)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {pending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner label="Revising" /> Rewriting<span className="tabular-nums"> · {elapsed}s</span>
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || change.trim().length < 3}>
              {pending ? <Spinner className="mr-1.5" label="Revising" /> : <Sparkles className="mr-1.5 size-4" />}
              Revise
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  proposalId,
  refNumber,
  onOpenChange,
}: {
  proposalId: string
  refNumber: string
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await deleteProposal(proposalId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push("/dashboard/proposals")
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {refNumber}?</DialogTitle>
          <DialogDescription>
            The proposal is removed for good. The client stays, with their code, invoices and everything else.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? <Spinner className="mr-1.5" label="Deleting" /> : <Trash2 className="mr-1.5 size-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
