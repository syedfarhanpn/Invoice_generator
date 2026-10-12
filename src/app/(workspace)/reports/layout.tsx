import { PageHeader } from "@/components/app/page-header"

import { ReportTabs } from "./report-tabs"

/**
 * One header and one set of tabs for every report, so moving between them
 * does not feel like moving between applications.
 */
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Reports" trail={[{ label: "Reports" }]} />
      <ReportTabs />
      {children}
    </div>
  )
}
