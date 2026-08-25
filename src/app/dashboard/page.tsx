import { Suspense } from "react"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { QuickActions } from "@/components/app/quick-actions"
import { TableSkeleton } from "@/components/app/skeletons"
import RecentDocuments from "./recent-documents"

/**
 * Deliberately NOT async: everything above the fold (title, quick actions) is
 * static, so it ships in the first chunk and the nav feels instant. Only the
 * recent-documents table touches the database, behind its own boundary.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <Link href="/dashboard/documents/new" className={buttonVariants()}>
          Create Document
        </Link>
      </div>

      <QuickActions />

      <div className="mt-8">
        <h3 className="text-xl font-bold tracking-tight mb-4">Recent Documents</h3>
        <Suspense fallback={<TableSkeleton columns={5} rows={5} />}>
          <RecentDocuments />
        </Suspense>
      </div>
    </div>
  )
}
