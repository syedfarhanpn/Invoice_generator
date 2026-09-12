import { PageHeaderSkeleton, TableSkeleton } from "@/components/app/skeletons"

/**
 * In a route group so it covers /dashboard/clients alone - otherwise this
 * list skeleton is also what the router prefetches for /clients/[id] and
 * /clients/new. See (home)/loading.tsx.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <TableSkeleton columns={6} rows={8} />
    </div>
  )
}
