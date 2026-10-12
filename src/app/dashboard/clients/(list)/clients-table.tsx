"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download, Mail, MoreHorizontal, Phone, Search, SlidersHorizontal } from "lucide-react"

import { Pagination } from "@/components/app/pagination"
import { RowCheckbox, SelectionBar, type BulkAction } from "@/components/app/selection-bar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { bulkArchiveClients, bulkDeleteClients } from "@/app/dashboard/bulk-actions"
import { partitionClients } from "@/lib/bulk-actions"
import { formatAmount } from "@/lib/format-compact"
import { memberInitials } from "@/lib/member-names"
import { pageSlice } from "@/lib/pagination"
import { cn } from "@/lib/utils"

/**
 * The clients table, laid out as the reference dashboard.
 *
 * Bulk selection is kept but moved behind the toolbar's "Select" control,
 * which is where the reference puts it. The checkbox column only appears once
 * you ask for it, so the default view is the nine columns the reference shows
 * rather than ten - and archiving a batch of clients is still one click away
 * instead of being dropped to match a picture.
 */

export type ClientRow = {
  id: string
  code: string
  fullName: string
  businessName: string | null
  email: string
  phone: string | null
  /** The named person, when one is recorded against the client. */
  contactPerson: string | null
  /** Industry from their company profile - the reference's "Type". */
  type: string | null
  status: "active" | "on-hold" | "archived"
  projects: number
  revenue: number
  joinedOn: string
  documentCount: number
  archived: boolean
}

const STATUS_TONE: Record<ClientRow["status"], string> = {
  active: "bg-tone-success-bg text-tone-success",
  "on-hold": "bg-tone-warning-bg text-tone-warning",
  archived: "bg-muted text-muted-foreground",
}

const STATUS_LABEL: Record<ClientRow["status"], string> = {
  active: "Active",
  "on-hold": "On Hold",
  archived: "Archived",
}

/** "12 Jan 2025", as the reference writes the joined date. */
const JOINED = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
})

export function ClientsTable({ rows, currency }: { rows: ClientRow[]; currency: string }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const types = useMemo(
    () => [...new Set(rows.map((r) => r.type).filter((t): t is string => !!t))].sort(),
    [rows]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (typeFilter !== "all" && row.type !== typeFilter) return false
      if (!q) return true
      return [row.businessName, row.fullName, row.email, row.contactPerson, row.code]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q))
    })
  }, [rows, query, typeFilter])

  // Only the rows on screen. Select-all follows suit: ticking the header box
  // should select what you can see, not silently arm an action against 17
  // records when 10 are in front of you.
  const visible = useMemo(() => pageSlice(filtered, page, pageSize), [filtered, page, pageSize])

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])
  const deletable = partitionClients(selectedRows).eligible
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function finish() {
    setSelected(new Set())
    router.refresh()
  }

  const actions: BulkAction[] = [
    {
      key: "archive",
      label: "Archive",
      // Always available: archiving is reversible and never destroys anything.
      eligible: selectedRows.length,
      variant: "outline",
      confirm: (n) =>
        `Archive ${n} client${n === 1 ? "" : "s"}? They stay on their documents and can be restored.`,
      run: () => bulkArchiveClients(selectedRows.map((r) => r.id), true),
    },
    {
      key: "restore",
      label: "Restore",
      eligible: selectedRows.filter((r) => r.archived).length,
      variant: "outline",
      confirm: (n) => `Restore ${n} client${n === 1 ? "" : "s"}?`,
      run: () => bulkArchiveClients(selectedRows.filter((r) => r.archived).map((r) => r.id), false),
    },
    {
      key: "delete",
      label: "Delete",
      eligible: deletable.length,
      variant: "destructive",
      confirm: (n) =>
        `Permanently delete ${n} client${n === 1 ? "" : "s"}? Only clients with no documents are removed - anyone you have billed is left untouched.`,
      run: () => bulkDeleteClients(deletable.map((r) => r.id)),
    },
  ]

  const columnCount = selectMode ? 10 : 9

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-3">
          <div className="relative mr-auto">
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
              placeholder="Search clients..."
              aria-label="Search clients"
              className="h-9 w-64 rounded-lg border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {types.length > 0 && (
            <label className="flex items-center gap-1.5">
              <SlidersHorizontal
                className="size-4 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="sr-only">Filter by type</span>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value)
                  setPage(1)
                }}
                className="h-9 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All types</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          )}

          <a
            href="/reports/export?report=clients&range=all"
            download
            aria-label="Export clients as CSV"
            className="rounded-md p-2 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Download className="size-4" strokeWidth={1.75} />
          </a>

          <Button
            type="button"
            size="sm"
            variant={selectMode ? "default" : "outline"}
            aria-pressed={selectMode}
            onClick={() => {
              setSelectMode((on) => !on)
              if (selectMode) setSelected(new Set())
            }}
          >
            Select
          </Button>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
                {selectMode && (
                  <th scope="col" className="w-10 px-4 py-2.5">
                    <RowCheckbox
                      checked={allSelected}
                      indeterminate={visible.some((r) => selected.has(r.id))}
                      onChange={(on) =>
                        setSelected((prev) => {
                          const next = new Set(prev)
                          for (const row of visible) {
                            if (on) next.add(row.id)
                            else next.delete(row.id)
                          }
                          return next
                        })
                      }
                      label="Select all clients on this page"
                    />
                  </th>
                )}
                <th scope="col" className="w-10 px-4 py-2.5 font-normal">#</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Client Name</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Contact Person</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Type</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
                <th scope="col" className="px-3 py-2.5 text-right font-normal">Projects</th>
                <th scope="col" className="px-3 py-2.5 text-right font-normal">Total Revenue</th>
                <th scope="col" className="px-3 py-2.5 font-normal">Joined On</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => {
                const name = row.businessName || row.fullName
                return (
                  <tr key={row.id} className="border-b transition-colors hover:bg-accent/50">
                    {selectMode && (
                      <td className="px-4 py-2.5">
                        <RowCheckbox
                          checked={selected.has(row.id)}
                          onChange={(on) => toggle(row.id, on)}
                          label={`Select ${name}`}
                        />
                      </td>
                    )}

                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {String((page - 1) * pageSize + i + 1).padStart(2, "0")}
                    </td>

                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-[10px] font-medium text-accent-foreground"
                        >
                          {memberInitials(name)}
                        </span>
                        <Link
                          href={`/dashboard/clients/${row.id}`}
                          className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {name}
                        </Link>
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-muted-foreground">
                      {row.contactPerson ?? row.fullName}
                    </td>

                    <td className="px-3 py-2.5">
                      {row.type ? (
                        <span className="inline-flex rounded-md bg-tone-info-bg px-2 py-0.5 text-xs font-medium whitespace-nowrap text-tone-info">
                          {row.type}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not recorded</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                          STATUS_TONE[row.status]
                        )}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-right tabular-nums">{row.projects}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatAmount(row.revenue, currency)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {JOINED.format(new Date(row.joinedOn))}
                    </td>

                    <td className="px-4 py-2.5">
                      <span className="flex items-center justify-end gap-1">
                        {/* Only rendered when there is something to dial or
                            write to - see the same rule on the leads table. */}
                        {row.phone && (
                          <a
                            href={`tel:${row.phone}`}
                            aria-label={`Call ${name}`}
                            className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Phone className="size-3.5" strokeWidth={1.75} />
                          </a>
                        )}
                        {row.email && (
                          <a
                            href={`mailto:${row.email}`}
                            aria-label={`Email ${name}`}
                            className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Mail className="size-3.5" strokeWidth={1.75} />
                          </a>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${name}`}
                            className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <MoreHorizontal className="size-4" strokeWidth={2} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => router.push(`/dashboard/clients/${row.id}`)}
                            >
                              View client
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => router.push(`/dashboard/clients/${row.id}/edit`)}
                            >
                              Edit client
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => router.push(`/dashboard/documents/new?client=${row.id}`)}
                            >
                              New document
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </td>
                  </tr>
                )
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={columnCount}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    {rows.length === 0
                      ? "No clients yet. Add one and their documents and projects collect here."
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
            noun="clients"
          />
        )}
      </section>

      <SelectionBar
        selectedCount={selected.size}
        actions={actions}
        onClear={() => setSelected(new Set())}
        onDone={finish}
      />
    </div>
  )
}
