import { Skeleton } from "@/components/ui/skeleton"
import { PageHeaderSkeleton, TableSkeleton } from "@/components/app/skeletons"

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap items-center gap-2">
        {[64, 80, 104, 100, 88, 104, 72, 88].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <TableSkeleton columns={6} rows={8} />
    </div>
  )
}
