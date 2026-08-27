import { Skeleton } from "@/components/ui/skeleton"
import { TableSkeleton } from "@/components/app/skeletons"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <TableSkeleton columns={7} rows={6} />
    </div>
  )
}
