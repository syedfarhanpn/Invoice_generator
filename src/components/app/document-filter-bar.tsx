import Link from "next/link"

import { cn } from "@/lib/utils"
import { DOCUMENT_FILTERS, type FilterKey } from "@/lib/document-filters"

/**
 * Filter state lives in the URL rather than component state, so a filtered
 * view is linkable, survives a refresh, and re-renders on the server.
 */
export function DocumentFilterBar({
  active,
  counts,
}: {
  active: FilterKey
  counts: Record<FilterKey, number>
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {DOCUMENT_FILTERS.map(({ key, label }) => {
        const isActive = key === active
        return (
          <Link
            key={key}
            // "all" is the default, so it drops the param instead of adding ?filter=all
            href={key === "all" ? "/dashboard/documents" : `/dashboard/documents?filter=${key}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-primary font-medium text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
          >
            {label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                isActive ? "bg-primary-foreground/20" : "bg-foreground/10"
              )}
            >
              {counts[key]}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
