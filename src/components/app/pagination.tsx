"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"

import { PAGE_SIZES, clampPage, pageWindow } from "@/lib/pagination"
import { cn } from "@/lib/utils"

/**
 * Table pagination, as the references show it: a count on the left, a page
 * size, and numbered pages on the right.
 *
 * Client-side, over rows the page already has. Every list in this product is
 * one operator's own records - tens to low hundreds - so fetching them once
 * and paging in the browser is both faster and simpler than a round trip per
 * page. A list that genuinely outgrows that wants server-side paging, and
 * this component would then take a page of rows instead of all of them.
 */

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  /** "clients", "invoices" - what the count is counting. */
  noun = "rows",
}: {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  noun?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = clampPage(page, totalPages)
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1
  const last = Math.min(current * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {total === 0 ? `No ${noun}` : `Showing ${first} to ${last} of ${total} ${noun}`}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">Show</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label={`${noun} per page`}
            className="h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <nav className="flex items-center gap-1" aria-label="Pagination">
          <PageButton
            label="Previous page"
            disabled={current <= 1}
            onClick={() => onPageChange(current - 1)}
          >
            <ChevronLeft className="size-4" />
          </PageButton>

          {pageWindow(current, totalPages).map((entry, i) =>
            entry === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === current ? "page" : undefined}
                className={cn(
                  "h-8 min-w-8 rounded-md px-2 text-sm tabular-nums transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  entry === current
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {entry}
              </button>
            )
          )}

          <PageButton
            label="Next page"
            disabled={current >= totalPages}
            onClick={() => onPageChange(current + 1)}
          >
            <ChevronRight className="size-4" />
          </PageButton>
        </nav>
      </div>
    </div>
  )
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}
