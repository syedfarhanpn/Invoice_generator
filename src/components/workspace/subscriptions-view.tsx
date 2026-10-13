"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, RefreshCw, Search, Trash2 } from "lucide-react"

import { Pagination } from "@/components/app/pagination"
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
import { formatAmount } from "@/lib/format-compact"
import { pageSlice } from "@/lib/pagination"
import { URGENCY_LABEL, type RenewalUrgency } from "@/lib/renewals"
import { cn } from "@/lib/utils"

import {
  archiveSubscription,
  renewSubscription,
  saveSubscription,
  type SubscriptionInput,
} from "@/app/(workspace)/renewals/actions"

/**
 * The list behind both AMC & Renewals and Domains & Hosting.
 *
 * One component rather than two, because they are one table filtered by kind -
 * see the note at the top of the Subscription model. What differs between the
 * pages is which kinds the form offers and which money column leads, and both
 * arrive as props.
 *
 * `days` and `urgency` are computed on the server and passed in. Working them
 * out here would mean the server and the browser each reading their own clock,
 * which is a hydration mismatch on every row.
 */

export type SubscriptionViewRow = {
  id: string
  kind: string
  kindLabel: string
  name: string
  status: "ACTIVE" | "CANCELLED"
  startsOn: string
  renewsOn: string
  renewsOnLabel: string
  days: number
  urgency: RenewalUrgency
  cycle: string
  cycleLabel: string
  cost: number | null
  price: number | null
  autoRenew: boolean
  provider: string | null
  accountRef: string | null
  notes: string | null
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectTitle: string | null
  ownerId: string | null
  ownerName: string | null
  lastRenewedLabel: string | null
  /** Pre-rendered on the server: "In 12 days", "3 days ago". */
  dueLabel: string
}

export type Option = { id: string; label: string }

const URGENCY_DOT: Record<RenewalUrgency, string> = {
  overdue: "bg-tone-danger",
  due: "bg-tone-warning",
  soon: "bg-tone-info",
  upcoming: "bg-muted-foreground/40",
  later: "bg-muted-foreground/25",
}

const URGENCY_TEXT: Record<RenewalUrgency, string> = {
  overdue: "text-tone-danger",
  due: "text-tone-warning",
  soon: "text-foreground",
  upcoming: "text-muted-foreground",
  later: "text-muted-foreground",
}

const CYCLES: Option[] = [
  { id: "MONTHLY", label: "Monthly" },
  { id: "QUARTERLY", label: "Quarterly" },
  { id: "HALF_YEARLY", label: "Half-yearly" },
  { id: "YEARLY", label: "Yearly" },
  { id: "BIENNIAL", label: "Every 2 years" },
  { id: "TRIENNIAL", label: "Every 3 years" },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function blank(kind: string): SubscriptionViewRow {
  return {
    id: "",
    kind,
    kindLabel: "",
    name: "",
    status: "ACTIVE",
    startsOn: today(),
    renewsOn: "",
    renewsOnLabel: "",
    days: 0,
    urgency: "later",
    cycle: "YEARLY",
    cycleLabel: "",
    cost: null,
    price: null,
    autoRenew: false,
    provider: null,
    accountRef: null,
    notes: null,
    clientId: null,
    clientName: null,
    projectId: null,
    projectTitle: null,
    ownerId: null,
    ownerName: null,
    lastRenewedLabel: null,
    dueLabel: "",
  }
}

export function SubscriptionsView({
  rows,
  kinds,
  defaultKind,
  clients,
  projects,
  members,
  currency,
  addLabel,
  emptyMessage,
  /** Domains and hosting cost us money; an AMC earns it. Decides which
   *  column leads and what the form asks for first. */
  lead = "cost",
}: {
  rows: SubscriptionViewRow[]
  kinds: Option[]
  defaultKind: string
  clients: Option[]
  projects: Option[]
  members: Option[]
  currency: string
  addLabel: string
  emptyMessage: string
  lead?: "cost" | "price"
}) {
  const [query, setQuery] = useState("")
  const [band, setBand] = useState<RenewalUrgency | "all">("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [editing, setEditing] = useState<SubscriptionViewRow | null>(null)

  const bands = useMemo(() => {
    const counts = new Map<RenewalUrgency, number>()
    for (const row of rows) counts.set(row.urgency, (counts.get(row.urgency) ?? 0) + 1)
    return (["overdue", "due", "soon", "upcoming", "later"] as RenewalUrgency[])
      .map((u) => ({ urgency: u, count: counts.get(u) ?? 0 }))
      .filter((u) => u.count > 0)
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (band !== "all" && row.urgency !== band) return false
      if (!q) return true
      return [row.name, row.provider, row.clientName, row.projectTitle, row.accountRef]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    })
  }, [rows, query, band])

  const visible = pageSlice(filtered, page, pageSize)

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.75}
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search by name, provider or client"
              aria-label="Search subscriptions"
              className="h-9 w-64 rounded-lg border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {bands.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip active={band === "all"} onClick={() => { setBand("all"); setPage(1) }}>
                All <span className="ml-1 tabular-nums opacity-70">{rows.length}</span>
              </FilterChip>
              {bands.map(({ urgency, count }) => (
                <FilterChip
                  key={urgency}
                  active={band === urgency}
                  onClick={() => { setBand(urgency); setPage(1) }}
                >
                  <span className={cn("mr-1.5 inline-block size-1.5 rounded-full", URGENCY_DOT[urgency])} />
                  {URGENCY_LABEL[urgency]}
                  <span className="ml-1 tabular-nums opacity-70">{count}</span>
                </FilterChip>
              ))}
            </div>
          )}
        </div>

        <Button size="sm" onClick={() => setEditing(blank(defaultKind))}>
          <Plus className="mr-1.5 size-4" /> {addLabel}
        </Button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 font-normal">Name</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Belongs to</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Renews</th>
              <th scope="col" className="px-4 py-2.5 font-normal">Cycle</th>
              <th scope="col" className="px-4 py-2.5 text-right font-normal">
                {lead === "cost" ? "We pay" : "They pay"}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-normal">
                {lead === "cost" ? "They pay" : "We pay"}
              </th>
              <th scope="col" className="px-4 py-2.5 font-normal">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <SubscriptionRow key={row.id} row={row} currency={currency} lead={lead} onEdit={() => setEditing(row)} />
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? emptyMessage : "Nothing matches that filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <Pagination
          total={filtered.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          noun="records"
        />
      )}

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {editing && (
            <SubscriptionForm
              key={editing.id || "new"}
              row={editing}
              kinds={kinds}
              clients={clients}
              projects={projects}
              members={members}
              lead={lead}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-ring bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function SubscriptionRow({
  row,
  currency,
  lead,
  onEdit,
}: {
  row: SubscriptionViewRow
  currency: string
  lead: "cost" | "price"
  onEdit: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const cancelled = row.status === "CANCELLED"
  const leadValue = lead === "cost" ? row.cost : row.price
  const otherValue = lead === "cost" ? row.price : row.cost

  return (
    <tr
      onClick={onEdit}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onEdit()
        }
      }}
      className="cursor-pointer border-b outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <td className="px-4 py-2.5">
        <span className={cn("block", cancelled && "text-muted-foreground line-through")}>
          {row.name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {row.kindLabel}
          {row.provider && ` · ${row.provider}`}
        </span>
      </td>

      <td className="px-4 py-2.5">
        {row.clientName ? (
          <span>{row.clientName}</span>
        ) : (
          // Named, not blank: our own domain is a deliberate attribution.
          <span className="text-muted-foreground">Our own</span>
        )}
        {row.projectTitle && (
          <span className="block text-xs text-muted-foreground">{row.projectTitle}</span>
        )}
      </td>

      <td className="px-4 py-2.5 whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", cancelled ? "bg-muted-foreground/25" : URGENCY_DOT[row.urgency])}
          />
          {row.renewsOnLabel}
        </span>
        <span
          className={cn(
            "block pl-3 text-xs",
            cancelled ? "text-muted-foreground" : URGENCY_TEXT[row.urgency]
          )}
        >
          {cancelled ? "Cancelled" : row.dueLabel}
        </span>
      </td>

      <td className="px-4 py-2.5 text-muted-foreground">
        {row.cycleLabel}
        {row.autoRenew && (
          <span className="block text-xs">Auto-renews</span>
        )}
      </td>

      <td className="px-4 py-2.5 text-right tabular-nums">
        {leadValue != null ? formatAmount(leadValue, currency) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
        {otherValue != null ? formatAmount(otherValue, currency) : "—"}
      </td>

      <td className="px-4 py-2.5 text-right">
        {!cancelled && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            // The row itself opens the editor, so this must not do both.
            onClick={(e) => {
              e.stopPropagation()
              startTransition(async () => {
                await renewSubscription(row.id)
                router.refresh()
              })
            }}
            title="Move the renewal date on by one cycle"
          >
            <RefreshCw className={cn("mr-1.5 size-3.5", pending && "animate-spin")} />
            {pending ? "Renewing" : "Renewed"}
          </Button>
        )}
      </td>
    </tr>
  )
}

function SubscriptionForm({
  row,
  kinds,
  clients,
  projects,
  members,
  lead,
  onClose,
}: {
  row: SubscriptionViewRow
  kinds: Option[]
  clients: Option[]
  projects: Option[]
  members: Option[]
  lead: "cost" | "price"
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    kind: row.kind,
    name: row.name,
    clientId: row.clientId ?? "",
    projectId: row.projectId ?? "",
    provider: row.provider ?? "",
    accountRef: row.accountRef ?? "",
    startsOn: row.startsOn,
    renewsOn: row.renewsOn,
    cycle: row.cycle,
    cost: row.cost != null ? String(row.cost) : "",
    price: row.price != null ? String(row.price) : "",
    autoRenew: row.autoRenew,
    status: row.status,
    ownerId: row.ownerId ?? "",
    notes: row.notes ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  /**
   * The checks a person can fail by typing, run before the round trip.
   *
   * The server validates all of this too and must keep doing so - this is a
   * message, not a gate. But a thrown Server Action error is REDACTED in a
   * production build: Next replaces the message with a generic one so server
   * internals cannot leak through it, and the operator sees a React error
   * code where a sentence should be. Saying it here is the only way the
   * sentence survives, and it is faster anyway.
   */
  const validate = (): string | null => {
    if (!form.name.trim()) {
      return "Give this a name - the domain, or what the contract covers."
    }
    if (!form.renewsOn) {
      return "Set the date it renews on."
    }
    if (form.startsOn && form.renewsOn < form.startsOn) {
      // Both are YYYY-MM-DD, so a string comparison is a date comparison.
      return "The renewal date cannot be before the start date."
    }
    for (const [label, value] of [
      ["What it costs", form.cost],
      ["What it is billed at", form.price],
    ] as const) {
      if (!value.trim()) continue
      const parsed = Number(value.replace(/[^0-9.-]/g, ""))
      if (!Number.isFinite(parsed) || parsed < 0) {
        return `${label} must be a positive amount, or left empty.`
      }
    }
    return null
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    startTransition(async () => {
      try {
        const payload: SubscriptionInput = {
          ...(row.id ? { id: row.id } : {}),
          kind: form.kind,
          name: form.name,
          clientId: form.clientId || null,
          projectId: form.projectId || null,
          provider: form.provider || null,
          accountRef: form.accountRef || null,
          startsOn: form.startsOn,
          renewsOn: form.renewsOn,
          cycle: form.cycle,
          cost: form.cost,
          price: form.price,
          autoRenew: form.autoRenew,
          status: form.status,
          ownerId: form.ownerId || null,
          notes: form.notes || null,
        }
        await saveSubscription(payload)
        router.refresh()
        onClose()
      } catch (cause) {
        // A production build redacts whatever the server threw, so its
        // message is often a React error code rather than a sentence. The
        // checks above catch everything a person can cause by typing; what
        // reaches here is a real fault, and saying so is more honest than
        // repeating a code nobody can act on.
        const message = cause instanceof Error ? cause.message : ""
        setError(
          message && !/minified react error|digest/i.test(message)
            ? message
            : "That could not be saved. Check the dates and amounts, then try again."
        )
      }
    })
  }

  const costField = (
    <div className="space-y-1">
      <Label htmlFor="sub-cost">We pay, per cycle</Label>
      <Input
        id="sub-cost"
        inputMode="decimal"
        value={form.cost}
        onChange={(e) => set("cost", e.target.value)}
        placeholder="900"
      />
    </div>
  )

  const priceField = (
    <div className="space-y-1">
      <Label htmlFor="sub-price">They pay, per cycle</Label>
      <Input
        id="sub-price"
        inputMode="decimal"
        value={form.price}
        onChange={(e) => set("price", e.target.value)}
        placeholder="1500"
      />
    </div>
  )

  return (
    <>
      <DialogHeader>
        <DialogTitle>{row.id ? "Edit" : "Add"}</DialogTitle>
        <DialogDescription>
          What it costs and what it is billed at are kept apart, so the margin is a
          recorded fact rather than a subtraction nobody did.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="sub-name">Name</Label>
            <Input
              id="sub-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="pixiewebs.com, Curefully AMC..."
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sub-kind">Kind</Label>
            <select
              id="sub-kind"
              value={form.kind}
              onChange={(e) => set("kind", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44"
            >
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sub-client">Client</Label>
            <select
              id="sub-client"
              value={form.clientId}
              onChange={(e) => set("clientId", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Our own</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sub-project">Project</Label>
            <select
              id="sub-project"
              value={form.projectId}
              onChange={(e) => set("projectId", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Not tied to a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="sub-starts">Started</Label>
            <Input
              id="sub-starts"
              type="date"
              value={form.startsOn}
              onChange={(e) => set("startsOn", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sub-renews">Renews on</Label>
            <Input
              id="sub-renews"
              type="date"
              value={form.renewsOn}
              onChange={(e) => set("renewsOn", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sub-cycle">Every</Label>
            <select
              id="sub-cycle"
              value={form.cycle}
              onChange={(e) => set("cycle", e.target.value)}
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

        <div className="grid gap-3 sm:grid-cols-2">
          {lead === "cost" ? costField : priceField}
          {lead === "cost" ? priceField : costField}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sub-provider">Provider</Label>
            <Input
              id="sub-provider"
              value={form.provider}
              onChange={(e) => set("provider", e.target.value)}
              placeholder="GoDaddy, Hostinger..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sub-account">Account reference</Label>
            <Input
              id="sub-account"
              value={form.accountRef}
              onChange={(e) => set("accountRef", e.target.value)}
              placeholder="Which account it sits under"
            />
            {/* Said plainly, because a field like this invites a password. */}
            <p className="text-xs text-muted-foreground">
              A reference only. Never store a password here.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sub-owner">Who renews it</Label>
            <select
              id="sub-owner"
              value={form.ownerId}
              onChange={(e) => set("ownerId", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sub-status">Status</Label>
            <select
              id="sub-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value as "ACTIVE" | "CANCELLED")}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="ACTIVE">Active</option>
              <option value="CANCELLED">Letting it lapse</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            checked={form.autoRenew}
            onChange={(e) => set("autoRenew", e.target.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          <span>
            The provider renews this automatically
            <span className="block text-xs text-muted-foreground">
              Changes what the date means: something to budget for rather than something to do.
            </span>
          </span>
        </label>

        <div className="space-y-1">
          <Label htmlFor="sub-notes">Notes</Label>
          <Textarea
            id="sub-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        {row.lastRenewedLabel && (
          <p className="text-xs text-muted-foreground">Last renewed {row.lastRenewedLabel}.</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {row.id ? (
            confirmArchive ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Archive this?</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await archiveSubscription(row.id)
                        router.refresh()
                        onClose()
                      } catch {
                        setError("That could not be archived.")
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
            )
          ) : (
            <span />
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : row.id ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
