import { Suspense } from "react"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { QuickActions } from "@/components/app/quick-actions"
import { StatsSkeleton, TableSkeleton } from "@/components/app/skeletons"
import InvoiceStats from "./invoice-stats"
import RecentDocuments from "./recent-documents"

export const metadata = { title: "Dashboard" }

/**
 * Deliberately NOT async: the title and quick actions are static, so they
 * ship in the first chunk and navigation feels instant. The two
 * database-backed sections stream in behind their own boundaries and do not
 * block each other.
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

      <Suspense fallback={<StatsSkeleton />}>
        <InvoiceStats />
      </Suspense>

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
