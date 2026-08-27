import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Shared Suspense fallbacks. Each one mirrors the chrome of the real UI it
 * stands in for (card, header row, row height) so that when the streamed
 * content swaps in, the layout doesn't jump.
 */

/** Page title + subtitle + action button placeholder. */
export function PageHeaderSkeleton({
  action = true,
  subtitle = true,
}: {
  action?: boolean
  subtitle?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        {subtitle && <Skeleton className="h-4 w-72" />}
      </div>
      {action && <Skeleton className="h-9 w-36 rounded-md" />}
    </div>
  )
}

/** Stands in for the list/table views. */
export function TableSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <Card>
      <div className="p-0">
        <div className="flex gap-4 border-b bg-muted px-4 py-3.5">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex gap-4 border-b px-4 py-4 last:border-b-0"
            // Fade on the row, not on each cell. Opacity inherits to children
            // so it looks identical, but it serialises one inline style per
            // row instead of one per cell. This markup ships in full on every
            // prefetch of the route, so the difference is not academic.
            // Rounded because 1 - r * 0.12 otherwise emits values like
            // 0.16000000000000003 straight into the payload.
            style={{ opacity: Math.max(0.15, Math.round((1 - r * 0.12) * 100) / 100) }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Stands in for a card-wrapped form (client form, business settings). */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <Card>
      <div className="space-y-2 px-(--card-spacing)">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-5 px-(--card-spacing) pt-2 md:grid-cols-2">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
      <div className="px-(--card-spacing)">
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </Card>
  )
}

/** Stands in for a row of stat cards (label, value, hint). */
export function StatsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between px-(--card-spacing)">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-4 rounded-full" />
          </div>
          <div className="space-y-2 px-(--card-spacing)">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </Card>
      ))}
    </div>
  )
}
