import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TableSkeleton } from "@/components/app/skeletons"

/**
 * In a route group so it covers /dashboard/clients/[id] alone - otherwise
 * this detail skeleton is also what the router prefetches for the edit form
 * below it. See (home)/loading.tsx.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <div className="space-y-2 px-(--card-spacing)">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-36" />
            </div>
          </Card>
        ))}
      </div>
      <TableSkeleton columns={5} rows={5} />
    </div>
  )
}
