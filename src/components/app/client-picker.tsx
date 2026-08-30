"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus, Search, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { createClient } from "@/app/dashboard/clients/actions"

export type PickableClient = {
  id: string
  fullName: string
  businessName: string | null
  code: string
  email: string
}

/** Sentinel for "no client", matching what the editors already store. */
export const NO_CLIENT = "none"

function label(client: PickableClient) {
  return client.businessName || client.fullName
}

/** Matches on every field someone might reasonably search by. */
function matches(client: PickableClient, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [client.fullName, client.businessName, client.code, client.email]
    .filter(Boolean)
    .some((field) => field!.toLowerCase().includes(q))
}

export function ClientPicker({
  clients,
  value,
  onChange,
  disabled,
}: {
  clients: PickableClient[]
  value: string
  onChange: (clientId: string) => void
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  // Clients created from the dialog appear instantly, without waiting for the
  // server component above to re-render with a refreshed list.
  const [created, setCreated] = useState<PickableClient[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const all = useMemo(() => [...created, ...clients], [created, clients])
  const selected = all.find((c) => c.id === value) ?? null
  const results = useMemo(() => all.filter((c) => matches(c, query)), [all, query])

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  function choose(id: string) {
    onChange(id)
    setOpen(false)
    setQuery("")
  }

  function handleCreated(client: PickableClient) {
    setCreated((prev) => [client, ...prev])
    setAddOpen(false)
    choose(client.id)
    // Bring the server's own list up to date for the next render.
    router.refresh()
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v)
          // Focus the search as soon as the panel exists.
          requestAnimationFrame(() => searchRef.current?.focus())
        }}
        className="h-9 w-full justify-between font-normal"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? `${label(selected)} (${selected.code})` : "Select a client"}
        </span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
      </Button>

      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, business, code or email"
              aria-label="Search clients"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => choose(NO_CLIENT)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
            >
              <Check className={cn("size-4 shrink-0", value !== NO_CLIENT && "opacity-0")} />
              <span className="text-muted-foreground">No client selected</span>
            </button>

            {results.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => choose(client.id)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                <Check className={cn("size-4 shrink-0", value !== client.id && "opacity-0")} />
                <span className="min-w-0 flex-1 truncate">
                  {label(client)}{" "}
                  <span className="font-mono text-xs text-muted-foreground">({client.code})</span>
                </span>
              </button>
            ))}

            {results.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                No client matches &ldquo;{query.trim()}&rdquo;.
              </p>
            )}
          </div>

          {/* Always available, so an unlisted client never means leaving the
              page - which on a draft would discard unsaved line items. */}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setAddOpen(true)
            }}
            className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium hover:bg-muted"
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            Add a new client
            {query.trim() && <span className="truncate text-muted-foreground">&ldquo;{query.trim()}&rdquo;</span>}
          </button>
        </div>
      )}

      {addOpen && (
        <AddClientDialog
          onOpenChange={setAddOpen}
          initialName={query.trim()}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

/**
 * Minimal create form: only the fields createClient() actually requires. The
 * serial code is auto-suggested server-side, and everything else can be filled
 * in later on the client's own page.
 */
function AddClientDialog({
  onOpenChange,
  initialName,
  onCreated,
}: {
  onOpenChange: (open: boolean) => void
  initialName: string
  onCreated: (client: PickableClient) => void
}) {
  // Mounted only while open, so the search text seeds the name field here
  // rather than through an effect.
  const [fullName, setFullName] = useState(initialName)
  const [businessName, setBusinessName] = useState("")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { id } = await createClient({
        fullName: fullName.trim(),
        businessName: businessName.trim() || undefined,
        email: email.trim(),
      })
      onCreated({
        id,
        fullName: fullName.trim(),
        businessName: businessName.trim() || null,
        // The real code is allocated server-side; router.refresh() replaces
        // this placeholder with the actual one moments later.
        code: "...",
        email: email.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that client.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
          <DialogDescription>
            Enough to raise a document. You can add address, tax ID and the rest later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="picker-fullName">Full name</Label>
            <Input
              id="picker-fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="picker-businessName">Business name (optional)</Label>
            <Input
              id="picker-businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="picker-email">Email</Label>
            <Input
              id="picker-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Spinner label="Adding" className="mr-2" /> Adding...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 size-4" /> Add client
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
