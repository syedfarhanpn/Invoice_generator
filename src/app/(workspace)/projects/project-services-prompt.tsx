"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Globe, Server, ShieldCheck } from "lucide-react"

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
import { cn } from "@/lib/utils"

import { addProjectServices } from "./actions"

/**
 * Offered when a project reaches deployment or completion.
 *
 * That is the moment its AMC, domain and hosting stop being plans and start
 * being money that leaves and arrives every year - and the moment they are
 * most likely to be forgotten, because the work is finished and everyone has
 * moved on. A year later the domain lapses and nobody knows whose it was.
 *
 * Offered, never automatic: not every delivered site carries an AMC, and a
 * renewal nobody agreed to would put a false commitment on the Renewals
 * screen and a false number in the margin.
 *
 * Each row becomes an ordinary Subscription - the same table the Renewals
 * tabs read - tied to this project and its client, so nothing downstream has
 * to know it came from here.
 */

type Kind = "AMC" | "DOMAIN" | "HOSTING"

type ServiceDraft = {
  kind: Kind
  enabled: boolean
  name: string
  renewsOn: string
  cycle: string
  cost: string
  price: string
  autoRenew: boolean
}

const KIND_META: Record<
  Kind,
  { label: string; icon: typeof ShieldCheck; hint: string; placeholder: string }
> = {
  AMC: {
    label: "AMC",
    icon: ShieldCheck,
    hint: "What the client pays you to keep it running.",
    placeholder: "Annual maintenance",
  },
  DOMAIN: {
    label: "Domain",
    icon: Globe,
    hint: "The address. Renew it or the site goes dark.",
    placeholder: "example.com",
  },
  HOSTING: {
    label: "Hosting",
    icon: Server,
    hint: "Where it runs, and what that costs.",
    placeholder: "Hosting - shared plan",
  },
}

const CYCLES = [
  { id: "MONTHLY", label: "Monthly" },
  { id: "QUARTERLY", label: "Quarterly" },
  { id: "HALF_YEARLY", label: "Half-yearly" },
  { id: "YEARLY", label: "Yearly" },
  { id: "BIENNIAL", label: "Every 2 years" },
  { id: "TRIENNIAL", label: "Every 3 years" },
]

/** A year from today, which is what almost every one of these renews on. */
function oneYearOut(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10)
}

function blank(kind: Kind, projectTitle: string): ServiceDraft {
  return {
    kind,
    enabled: false,
    // Pre-named after the project, because "Annual maintenance" on its own
    // tells you nothing in a list of thirty renewals.
    name: kind === "AMC" ? `${projectTitle} - AMC` : "",
    renewsOn: oneYearOut(),
    cycle: "YEARLY",
    cost: "",
    price: "",
    autoRenew: false,
  }
}

export type ServicesPromptTarget = {
  projectId: string
  title: string
  stageName: string
}

export function ProjectServicesPrompt({
  target,
  onClose,
}: {
  target: ServicesPromptTarget | null
  onClose: () => void
}) {
  return (
    <Dialog open={target != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        {target && <ServicesForm key={target.projectId} target={target} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ServicesForm({
  target,
  onClose,
}: {
  target: ServicesPromptTarget
  onClose: () => void
}) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<ServiceDraft[]>([
    blank("AMC", target.title),
    blank("DOMAIN", target.title),
    blank("HOSTING", target.title),
  ])
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const update = (kind: Kind, patch: Partial<ServiceDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.kind === kind ? { ...d, ...patch } : d)))

  const chosen = drafts.filter((d) => d.enabled)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const incomplete = chosen.find((d) => !d.name.trim() || !d.renewsOn.trim())
    if (incomplete) {
      setError(`Give the ${KIND_META[incomplete.kind].label.toLowerCase()} a name and a date.`)
      return
    }

    startTransition(async () => {
      try {
        await addProjectServices({
          projectId: target.projectId,
          note: note || null,
          services: chosen.map((d) => ({
            kind: d.kind,
            name: d.name,
            renewsOn: d.renewsOn,
            cycle: d.cycle,
            cost: d.cost,
            price: d.price,
            autoRenew: d.autoRenew,
          })),
        })
        router.refresh()
        onClose()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Those could not be saved.")
      }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target.title} reached {target.stageName}</DialogTitle>
        <DialogDescription>
          Anything that now renews on a date belongs on the Renewals screen. Tick what applies -
          you can skip this and add them later.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        {drafts.map((draft) => {
          const meta = KIND_META[draft.kind]
          const Icon = meta.icon
          return (
            <div
              key={draft.kind}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                draft.enabled ? "border-ring bg-accent/30" : "bg-card"
              )}
            >
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => update(draft.kind, { enabled: e.target.checked })}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                    {meta.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                </span>
              </label>

              {draft.enabled && (
                <div className="mt-3 space-y-2.5 pl-6.5">
                  <div className="space-y-1">
                    <Label htmlFor={`svc-${draft.kind}-name`}>Name</Label>
                    <Input
                      id={`svc-${draft.kind}-name`}
                      value={draft.name}
                      onChange={(e) => update(draft.kind, { name: e.target.value })}
                      placeholder={meta.placeholder}
                    />
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`svc-${draft.kind}-renews`}>Renews on</Label>
                      <Input
                        id={`svc-${draft.kind}-renews`}
                        type="date"
                        value={draft.renewsOn}
                        onChange={(e) => update(draft.kind, { renewsOn: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`svc-${draft.kind}-cycle`}>Every</Label>
                      <select
                        id={`svc-${draft.kind}-cycle`}
                        value={draft.cycle}
                        onChange={(e) => update(draft.kind, { cycle: e.target.value })}
                        className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {CYCLES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`svc-${draft.kind}-cost`}>We pay, per cycle</Label>
                      <Input
                        id={`svc-${draft.kind}-cost`}
                        inputMode="decimal"
                        value={draft.cost}
                        onChange={(e) => update(draft.kind, { cost: e.target.value })}
                        placeholder="900"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`svc-${draft.kind}-price`}>They pay, per cycle</Label>
                      <Input
                        id={`svc-${draft.kind}-price`}
                        inputMode="decimal"
                        value={draft.price}
                        onChange={(e) => update(draft.kind, { price: e.target.value })}
                        placeholder="1500"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={draft.autoRenew}
                      onChange={(e) => update(draft.kind, { autoRenew: e.target.checked })}
                      className="size-3.5 accent-primary"
                    />
                    The provider renews this automatically
                  </label>
                </div>
              )}
            </div>
          )
        })}

        <div className="space-y-1">
          <Label htmlFor="svc-note">Anything special worth remembering</Label>
          <Textarea
            id="svc-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Client owns the domain and renews it themselves. SSL is on their Cloudflare. Billing goes to accounts@..."
          />
          <p className="text-xs text-muted-foreground">
            Saved against each one above, so it is there a year from now when nobody remembers.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Not this one
          </Button>
          <Button type="submit" disabled={pending || chosen.length === 0}>
            {pending
              ? "Saving..."
              : chosen.length === 0
                ? "Tick what applies"
                : `Add ${chosen.length} to Renewals`}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
