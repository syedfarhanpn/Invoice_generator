"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Download } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { RANGE_OPTIONS, type RangeKey } from "@/lib/report-range"
import { cn } from "@/lib/utils"

/**
 * The date range a report covers, and a way to take it away as a file.
 *
 * The range lives in the URL rather than in component state, so a report is
 * something you can send someone: the link carries what it was showing. That
 * also means the export button only has to pass the same query string along,
 * and cannot drift from what is on screen.
 */
export function ReportToolbar({
  activeKey,
  from,
  to,
  /** Which export the download button asks for. Omitted hides it. */
  exportKey,
  rangeNote,
}: {
  activeKey: RangeKey
  from?: string
  to?: string
  exportKey?: string
  rangeNote: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [customFrom, setCustomFrom] = useState(from ?? "")
  const [customTo, setCustomTo] = useState(to ?? "")
  const [showCustom, setShowCustom] = useState(activeKey === "custom")

  function apply(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value == null) query.delete(key)
      else query.set(key, value)
    }
    router.push(`${pathname}?${query.toString()}`)
  }

  const exportHref = exportKey
    ? `/reports/export?${new URLSearchParams({
        report: exportKey,
        ...Object.fromEntries(params.entries()),
      }).toString()}`
    : null

  return (
    <section className="rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={activeKey === option.key}
              onClick={() => {
                setShowCustom(false)
                // Clearing the custom days matters: leaving them behind means
                // a later click on "Custom" silently reapplies an old range.
                apply({ range: option.key, from: null, to: null })
              }}
              className={cn(
                "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeKey === option.key
                  ? "border-ring bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}

          <button
            type="button"
            aria-pressed={activeKey === "custom"}
            onClick={() => setShowCustom((open) => !open)}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeKey === "custom"
                ? "border-ring bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Custom
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">{rangeNote}</span>
          {exportHref && (
            // A plain anchor, not a router link: this is a file download, and
            // the client router would try to render the response as a page.
            <a href={exportHref} download className={buttonVariants({ size: "sm", variant: "outline" })}>
              <Download className="mr-1.5 size-4" /> Export CSV
            </a>
          )}
        </div>
      </div>

      {showCustom && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (!customFrom || !customTo) return
            apply({ range: "custom", from: customFrom, to: customTo })
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              required
              className="h-8 rounded-md border bg-transparent px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              required
              className="h-8 rounded-md border bg-transparent px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <Button type="submit" size="sm">
            Apply
          </Button>
        </form>
      )}

      <p className="mt-2 text-xs text-muted-foreground sm:hidden">{rangeNote}</p>
    </section>
  )
}
