"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Search, Trash2 } from "lucide-react"

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
import { cn } from "@/lib/utils"

import { archiveExpense, saveExpense, type ExpenseInput } from "./actions"

export type ExpenseRow = {
  id: string
  title: string
  category: string
  amount: number
  spentOn: string
  spentOnLabel: string
  vendor: string | null
  paymentMethod: string | null
  status: string
  scope: "PROJECT" | "OVERHEAD"
  projectId: string | null
  projectTitle: string | null
  departmentId: string | null
  departmentName: string | null
  recurrence: string
  notes: string | null
}

export type Option = { id: string; label: string }

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-tone-success-bg text-tone-success",
  PENDING: "bg-tone-warning-bg text-tone-warning",
  PARTIALLY_PAID: "bg-tone-info-bg text-tone-info",
  OVERDUE: "bg-tone-danger-bg text-tone-danger",
}

const STATUS_LABEL: Record<string, string> = {
  PAID: "Paid",
  PENDING: "Pending",
  PARTIALLY_PAID: "Part paid",
  OVERDUE: "Overdue",
}

const RECURRENCE_LABEL: Record<string, string> = {
  ONE_OFF: "One-off",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
}

/** A fresh row, so the form opens on something rather than on undefined. */
function blank(): ExpenseRow {
  return {
    id: "",
    title: "",
    category: "",
    amount: 0,
    spentOn: new Date().toISOString().slice(0, 10),
    spentOnLabel: "",
    vendor: null,
    paymentMethod: null,
    status: "PAID",
    scope: "OVERHEAD",
    projectId: null,
    projectTitle: null,
    departmentId: null,
    departmentName: null,
    recurrence: "ONE_OFF",
    notes: null,
  }
}

/**
 * A chip colour per category.
 *
 * Categories are free text seeded from the operator's own settings, so there
 * is no fixed list to map colours onto. Hashing the name picks one from a
 * small palette: the same category is always the same colour, a renamed one
 * gets a new colour rather than an error, and nobody has to configure
 * anything. The point is telling two rows apart at a glance, not meaning.
 */
const CATEGORY_TONES = [
  "bg-tone-info-bg text-tone-info",
  "bg-tone-success-bg text-tone-success",
  "bg-tone-warning-bg text-tone-warning",
  "bg-tone-special-bg text-tone-special",
  "bg-chart-1/10 text-chart-1",
  "bg-chart-5/15 text-chart-5",
]

function categoryTone(category: string): string {
  let hash = 0
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash * 31 + category.charCodeAt(i)) | 0
  }
  return CATEGORY_TONES[Math.abs(hash) % CATEGORY_TONES.length]
}

export function ExpensesTable({
  rows,
  projects,
  departments,
  currency,
  categories,
}: {
  rows: ExpenseRow[]
  projects: Option[]
  departments: Option[]
  currency: string
  categories: string[]
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [editing, setEditing] = useState<ExpenseRow | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [row.title, row.category, row.vendor, row.projectTitle, row.departmentName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    )
  }, [rows, query])

  const visible = pageSlice(filtered, page, pageSize)

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
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
            placeholder="Search expenses"
            aria-label="Search expenses"
            className="h-9 w-56 rounded-lg border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button size="sm" onClick={() => setEditing(blank())}>
          <Plus className="mr-1.5 size-4" /> Add expense
        </Button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
              <th scope="col" className="w-14 px-4 py-2.5 font-normal">S.No</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Date</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Expense Title</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Category</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Vendor</th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Amount</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Payment Method</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Attributed to</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
              <th scope="col" className="px-3 py-2.5 font-normal">Notes</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr
                key={row.id}
                onClick={() => setEditing(row)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setEditing(row)
                  }
                }}
                className="cursor-pointer border-b outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                  {(page - 1) * pageSize + i + 1}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                  {row.spentOnLabel}
                </td>
                <td className="px-3 py-2.5 font-medium">
                  <span className="block max-w-48 truncate">{row.title}</span>
                </td>
                <td className="px-3 py-2.5">
                  {/* A tinted chip per category, as the reference draws them.
                      The palette is picked from the name so the same category
                      keeps the same colour everywhere, without anyone having
                      to configure one. */}
                  <span
                    className={cn(
                      "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                      categoryTone(row.category)
                    )}
                  >
                    {row.category}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  <span className="block max-w-32 truncate">{row.vendor || "—"}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatAmount(row.amount, currency)}
                  {row.recurrence !== "ONE_OFF" && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {RECURRENCE_LABEL[row.recurrence]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{row.paymentMethod || "—"}</td>
                <td className="px-3 py-2.5">
                  {row.scope === "PROJECT" ? (
                    <span className="block max-w-36 truncate">
                      {row.projectTitle ?? "Project removed"}
                    </span>
                  ) : (
                    // Named, not blank: overhead is a deliberate attribution.
                    <span className="text-muted-foreground">
                      Overhead
                      {row.departmentName && (
                        <span className="text-muted-foreground"> · {row.departmentName}</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
                      STATUS_TONE[row.status] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  <span className="block max-w-40 truncate" title={row.notes ?? undefined}>
                    {row.notes || "—"}
                  </span>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "No expenses recorded yet. Add one and it will feed the figures above."
                    : "Nothing matches that search."}
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
          noun="expenses"
        />
      )}

      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          {editing && (
            <ExpenseForm
              key={editing.id || "new"}
              row={editing}
              projects={projects}
              departments={departments}
              categories={categories}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ExpenseForm({
  row,
  projects,
  departments,
  categories,
  onClose,
}: {
  row: ExpenseRow
  projects: Option[]
  departments: Option[]
  categories: string[]
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    title: row.title,
    category: row.category,
    amount: row.amount ? String(row.amount) : "",
    spentOn: row.spentOn,
    vendor: row.vendor ?? "",
    paymentMethod: row.paymentMethod ?? "",
    status: row.status,
    scope: row.scope,
    projectId: row.projectId ?? "",
    departmentId: row.departmentId ?? "",
    recurrence: row.recurrence,
    notes: row.notes ?? "",
  })
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const payload: ExpenseInput = {
          ...(row.id ? { id: row.id } : {}),
          title: form.title,
          category: form.category,
          amount: form.amount,
          spentOn: form.spentOn,
          vendor: form.vendor || null,
          paymentMethod: form.paymentMethod || null,
          status: form.status,
          scope: form.scope,
          projectId: form.scope === "PROJECT" ? form.projectId || null : null,
          departmentId: form.departmentId || null,
          recurrence: form.recurrence,
          notes: form.notes || null,
        }
        await saveExpense(payload)
        router.refresh()
        onClose()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That did not save.")
      }
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{row.id ? "Edit expense" : "Add expense"}</DialogTitle>
        <DialogDescription>
          Every cost is either attributed to one project or carried as company overhead.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="exp-title">Title</Label>
          <Input
            id="exp-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Google Workspace, office rent, Meta ads..."
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="exp-amount">Amount</Label>
            <Input
              id="exp-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="12000"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-date">Date</Label>
            <Input
              id="exp-date"
              type="date"
              value={form.spentOn}
              onChange={(e) => set("spentOn", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="exp-category">Category</Label>
            <Input
              id="exp-category"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              list="expense-categories"
              placeholder="Software & Tools"
              required
            />
            <datalist id="expense-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-vendor">Vendor</Label>
            <Input
              id="exp-vendor"
              value={form.vendor}
              onChange={(e) => set("vendor", e.target.value)}
              placeholder="Google, Vercel, landlord..."
            />
          </div>
        </div>

        {/* The attribution. Kept together in its own block because the two
            controls are one decision: a project cost, or overhead. */}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Attributed to</p>
          <div className="flex flex-wrap gap-2">
            {(["OVERHEAD", "PROJECT"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => set("scope", scope)}
                aria-pressed={form.scope === scope}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  form.scope === scope
                    ? "border-ring bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {scope === "OVERHEAD" ? "Company overhead" : "A project"}
              </button>
            ))}
          </div>

          {form.scope === "PROJECT" && (
            <div className="space-y-1 pt-1">
              <Label htmlFor="exp-project">Project</Label>
              <select
                id="exp-project"
                value={form.projectId}
                onChange={(e) => set("projectId", e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                <option value="">Pick a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1 pt-1">
            <Label htmlFor="exp-department">Department</Label>
            <select
              id="exp-department"
              value={form.departmentId}
              onChange={(e) => set("departmentId", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Not assigned</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Independent of the above - a project cost still belongs to a department.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="exp-status">Status</Label>
            <select
              id="exp-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-recurrence">Repeats</Label>
            <select
              id="exp-recurrence"
              value={form.recurrence}
              onChange={(e) => set("recurrence", e.target.value)}
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {Object.entries(RECURRENCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-method">Paid by</Label>
            <Input
              id="exp-method"
              value={form.paymentMethod}
              onChange={(e) => set("paymentMethod", e.target.value)}
              placeholder="UPI, card..."
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="exp-notes">Notes</Label>
          <Textarea
            id="exp-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          {row.id ? (
            confirmArchive ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Archive this expense?</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await archiveExpense(row.id)
                        router.refresh()
                        onClose()
                      } catch {
                        setError("That expense could not be archived.")
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
            {pending ? "Saving..." : row.id ? "Save" : "Add expense"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
