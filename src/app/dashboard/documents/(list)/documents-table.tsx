"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Eye, FileText, MoreHorizontal, Search, SlidersHorizontal } from "lucide-react"
import type { DocumentStatus, DocumentType } from "@prisma/client"

import { Pagination } from "@/components/app/pagination"
import { RowCheckbox, SelectionBar, type BulkAction } from "@/components/app/selection-bar"
import { LifecycleBadge, PaymentBadge } from "@/components/app/status-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { bulkDeleteDocuments, bulkVoidDocuments } from "@/app/dashboard/bulk-actions"
import { partitionDocuments } from "@/lib/bulk-actions"
import { DOCUMENT_FILTERS, type FilterKey } from "@/lib/document-filters"
import { pageSlice } from "@/lib/pagination"
import { cn } from "@/lib/utils"

/**
 * The documents list, laid out as the reference dashboard.
 *
 * Tabs split by TYPE and the select narrows by STATUS - two different
 * questions that used to share one row of chips, where "Quotations" and
 * "Overdue" sat side by side as if they were alternatives. They are not: a
 * quotation can be overdue.
 *
 * The status filter stays in the URL rather than in component state, so a
 * filtered view is still linkable and survives a refresh. The tab counts
 * describe whatever that filter has left in play, which is why the control
 * saying which filter is on sits right beside them.
 */

export type DocumentRow = {
  id: string
  refLabel: string
  typeLabel: string
  type: DocumentType
  clientName: string
  status: DocumentStatus
  totalAmount: number | null
  amountPaid: number
  advanceReceived: number
  dueDate: Date | null
  currency: string
  amountText: string
  /** Still to come in. "-" when the document carries no ledger. */
  balanceText: string
  issueDateText: string
  dueDateText: string
}

/** The tabs, in the order the reference shows them. */
const TABS: { type: DocumentType; label: string }[] = [
  { type: "INVOICE", label: "Invoices" },
  { type: "QUOTE", label: "Quotations" },
  { type: "PROFORMA", label: "Proformas" },
  { type: "CONTRACT", label: "Contracts" },
]

export function DocumentsTable({
  rows,
  emptyMessage,
  activeFilter,
}: {
  rows: DocumentRow[]
  emptyMessage: string
  activeFilter: FilterKey
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<DocumentType>("INVOICE")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const byType = useMemo(() => {
    const map = new Map<DocumentType, DocumentRow[]>(TABS.map((t) => [t.type, []]))
    for (const row of rows) map.get(row.type)?.push(row)
    return map
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const inTab = byType.get(tab) ?? []
    if (!q) return inTab
    return inTab.filter((row) =>
      [row.refLabel, row.clientName, row.typeLabel].some((field) =>
        field.toLowerCase().includes(q)
      )
    )
  }, [byType, tab, query])

  const visible = pageSlice(filtered, page, pageSize)

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])

  // Eligibility is computed from the same rules the server enforces, so the
  // counts on the buttons match what will actually happen.
  const deletable = partitionDocuments(selectedRows, "delete").eligible
  const voidable = partitionDocuments(selectedRows, "void").eligible

  // Scoped to the page on screen, not to every row behind the pagination: a
  // header checkbox that silently selects 28 documents while showing 10 is how
  // a bulk delete takes rows nobody looked at. Rows already selected on other
  // pages stay selected - the SelectionBar count is what says how many.
  const pageIds = visible.map((r) => r.id)
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAllOnPage(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of pageIds) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function finish() {
    setSelected(new Set())
    router.refresh()
  }

  function setFilter(key: FilterKey) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === "active") params.delete("filter")
    else params.set("filter", key)
    const qs = params.toString()
    router.push(qs ? `/dashboard/documents?${qs}` : "/dashboard/documents")
  }

  const actions: BulkAction[] = [
    {
      key: "void",
      label: "Void",
      eligible: voidable.length,
      variant: "outline",
      confirm: (n) =>
        `Void ${n} document${n === 1 ? "" : "s"}? Their numbers stay allocated and their share links are revoked. This cannot be undone.`,
      run: () => bulkVoidDocuments(voidable.map((r) => r.id)),
    },
    {
      key: "delete",
      label: "Delete",
      eligible: deletable.length,
      variant: "destructive",
      confirm: (n) =>
        `Permanently delete ${n} draft${n === 1 ? "" : "s"}? Only drafts are removed - issued documents are never deleted.`,
      run: () => bulkDeleteDocuments(deletable.map((r) => r.id)),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div
          role="tablist"
          aria-label="Document type"
          className="flex flex-wrap items-center gap-1 border-b"
        >
          {TABS.map((t) => {
            const selectedTab = t.type === tab
            return (
              <button
                key={t.type}
                type="button"
                role="tab"
                aria-selected={selectedTab}
                onClick={() => {
                  setTab(t.type)
                  setPage(1)
                }}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  selectedTab
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="size-4" strokeWidth={1.75} aria-hidden />
                {t.label}
                <span className="tabular-nums opacity-70">
                  ({(byType.get(t.type) ?? []).length})
                </span>
              </button>
            )
          })}
        </div>

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
                placeholder="Search by reference or client"
                aria-label="Search documents"
                className="h-9 w-64 rounded-lg border bg-background pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* The chips this replaces lived in the URL, and so does this. */}
              <label className="flex items-center gap-1.5">
                <SlidersHorizontal
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="sr-only">Filter by status</span>
                <select
                  value={activeFilter}
                  onChange={(e) => setFilter(e.target.value as FilterKey)}
                  className="h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {DOCUMENT_FILTERS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Bulk actions are real but destructive, so the checkbox column
                  is opt-in rather than a tenth column nobody asked for. */}
              <button
                type="button"
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting((on) => !on)
                  if (selecting) setSelected(new Set())
                }}
                className={cn(
                  "h-8 rounded-md border px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selecting
                    ? "border-ring bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Select
              </button>
            </div>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
                  {selecting && (
                    <th scope="col" className="w-10 px-4 py-2.5">
                      <RowCheckbox
                        checked={allOnPageSelected}
                        indeterminate={pageIds.some((id) => selected.has(id))}
                        onChange={toggleAllOnPage}
                        label="Select all documents on this page"
                      />
                    </th>
                  )}
                  <th scope="col" className="w-14 px-4 py-2.5 font-normal">S.No</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Document No.</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Client</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">Amount</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">
                    Balance to Receive
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Payment Status</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Issue Date</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Due Date</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-normal">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((doc, i) => (
                  <tr
                    key={doc.id}
                    data-selected={selected.has(doc.id) || undefined}
                    className="border-b transition-colors hover:bg-accent/50 data-selected:bg-accent"
                  >
                    {selecting && (
                      <td className="px-4 py-2.5">
                        <RowCheckbox
                          checked={selected.has(doc.id)}
                          onChange={(on) => toggle(doc.id, on)}
                          label={`Select ${doc.refLabel}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                      {(page - 1) * pageSize + i + 1}
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      <Link
                        href={`/dashboard/documents/${doc.id}`}
                        className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {doc.refLabel}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block max-w-40 truncate">{doc.clientName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{doc.amountText}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {doc.balanceText}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <LifecycleBadge status={doc.status} />
                        {doc.type === "INVOICE" &&
                          doc.status !== "DRAFT" &&
                          doc.status !== "VOID" && (
                            <PaymentBadge
                              totalAmount={doc.totalAmount}
                              amountPaid={doc.amountPaid}
                              dueDate={doc.dueDate}
                              isDraft={false}
                              currency={doc.currency}
                              advanceReceived={doc.advanceReceived}
                            />
                          )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {doc.issueDateText}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {doc.dueDateText}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center justify-end gap-1">
                        <Link
                          href={`/dashboard/documents/${doc.id}`}
                          aria-label={`Open ${doc.refLabel}`}
                          className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Eye className="size-4" strokeWidth={1.75} />
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${doc.refLabel}`}
                            className="rounded-md p-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <MoreHorizontal className="size-4" strokeWidth={2} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => router.push(`/dashboard/documents/${doc.id}`)}
                            >
                              Open document
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setSelecting(true)}>
                              Select rows
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={selecting ? 10 : 9}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      {/* Three different empty states, because they call for
                          three different next moves: nothing here at all,
                          nothing of THIS type under the current status
                          filter, or a search that matched nothing. */}
                      {rows.length === 0
                        ? emptyMessage
                        : (byType.get(tab) ?? []).length === 0
                          ? `No ${TABS.find((t) => t.type === tab)?.label.toLowerCase()} match this filter.`
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
              noun="documents"
            />
          )}
        </section>
      </div>

      <SelectionBar
        selectedCount={selected.size}
        actions={actions}
        onClear={() => setSelected(new Set())}
        onDone={finish}
      />
    </div>
  )
}
