import { PageHeaderSkeleton, TableSkeleton } from "@/components/app/skeletons"

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <TableSkeleton columns={6} rows={8} />
    </div>
  )
}
