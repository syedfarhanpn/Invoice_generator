import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { TableSkeleton } from "@/components/app/skeletons"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-full justify-between">
            <div className="px-(--card-spacing)">
              <Skeleton className="size-9 rounded-lg" />
            </div>
            <div className="space-y-2 px-(--card-spacing)">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3.5 w-full" />
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-8 space-y-4">
        <Skeleton className="h-6 w-48" />
        <TableSkeleton columns={5} rows={5} />
      </div>
    </div>
  )
}
