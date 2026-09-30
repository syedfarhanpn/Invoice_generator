import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The title block every page wears: name on the left, trail on the right.
 *
 * The trail is always rooted at the dashboard, because the rail is the only
 * other way back and a page reached from a card needs a way up that is not
 * the browser button.
 */
export function PageHeader({
  title,
  trail = [],
  actions,
}: {
  title: string
  /** Everything between the dashboard and here. The last entry is this page. */
  trail?: { label: string; href?: string }[]
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>

      <div className="flex items-center gap-3">
        {actions}
        <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-sm sm:flex">
          <Link href="/dashboard" className="text-muted-foreground transition-colors hover:text-foreground">
            Home
          </Link>
          {trail.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              <ChevronRight className="size-3.5 text-muted-foreground" strokeWidth={2} />
              {crumb.href && i < trail.length - 1 ? (
                <Link
                  href={crumb.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
    </header>
  )
}

/** A row of figures under a page header, as the reference lays them out:
 *  one bordered strip, divided rather than gapped. */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 divide-y rounded-xl border bg-card sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string
  value: string
  /** Rendered in the signal colour only when it carries a direction. */
  delta?: { text: string; direction: "up" | "down" | "flat" }
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>
}) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {Icon && <Icon className="size-4" strokeWidth={1.75} />}
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {delta && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "font-medium",
              delta.direction === "up" && "text-tone-success",
              delta.direction === "down" && "text-tone-danger",
              delta.direction === "flat" && "text-muted-foreground"
            )}
          >
            {delta.text}
          </span>
        </div>
      )}
    </div>
  )
}
