import { NextResponse, type NextRequest } from "next/server"

import { hasPermission } from "@/lib/access"
import { csvBody, csvFilename, toCsv, type CsvColumn } from "@/lib/csv"
import { getCurrentUser } from "@/lib/current-user"
import { CYCLE_LABEL, KIND_LABEL } from "@/lib/renewals"
import {
  getClientsReport,
  getExpensesReport,
  getProjectsReport,
  getRenewalsReport,
  getSalesReport,
} from "@/lib/reports/fetch"
import { rangeFromParams } from "@/lib/reports/params"

/**
 * Report exports.
 *
 * This hands out the whole of a workspace's commercial record as a file, so
 * the order of business is: authenticate, THEN decide what to build. The user
 * comes from getCurrentUser(), never from the query string - a report name is
 * the only thing the caller gets to choose, and it is checked against a fixed
 * list rather than used to look anything up.
 *
 * Values are written raw (1234.5, not "₹1.2K"): a spreadsheet can format a
 * number but cannot recover one. Escaping and spreadsheet-formula safety are
 * handled in src/lib/csv.ts.
 */

const REPORTS = ["sales", "clients", "projects", "expenses", "renewals"] as const
type ReportName = (typeof REPORTS)[number]

function isReportName(value: string | null): value is ReportName {
  return value != null && (REPORTS as readonly string[]).includes(value)
}

export async function GET(request: NextRequest) {
  // Before anything is read from the database or the query string.
  const user = await getCurrentUser()

  // Caught and answered as 403 rather than left to throw: an uncaught throw
  // becomes a 500, which says "this broke" when the truth is "you may not".
  // A caller reading the status code should be able to tell those apart.
  if (!(await hasPermission("reports", "read"))) {
    return NextResponse.json({ error: "You do not have access to reports." }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const report = params.get("report")
  if (!isReportName(report)) {
    return NextResponse.json({ error: "Unknown report." }, { status: 400 })
  }

  const now = new Date()
  const range = rangeFromParams(
    {
      range: params.get("range") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    },
    now
  )

  const { name, csv } = await build(report, user.id, range, now)

  return new NextResponse(csvBody(csv), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(name, now)}"`,
      // A workspace's own figures; never cached by anything in between.
      "Cache-Control": "no-store, private",
    },
  })
}

async function build(
  report: ReportName,
  userId: string,
  range: ReturnType<typeof rangeFromParams>,
  now: Date
): Promise<{ name: string; csv: string }> {
  switch (report) {
    case "sales": {
      const data = await getSalesReport(userId, range)
      const columns: CsvColumn<(typeof data.rows)[number]>[] = [
        { header: "Lead", value: (r) => r.title },
        { header: "Client", value: (r) => r.clientName },
        { header: "Stage", value: (r) => r.stageName },
        { header: "Outcome", value: (r) => r.stageType },
        { header: "Source", value: (r) => r.source },
        { header: "Owner", value: (r) => r.ownerName ?? "Unassigned" },
        { header: "Value", value: (r) => r.value },
        { header: "Currency", value: (r) => r.currency },
        { header: "Created", value: (r) => r.createdAt },
        { header: "Closed", value: (r) => r.closedAt },
      ]
      // The whole period, not the ten shown on screen - an export that only
      // contained what fitted in a card would be a trap.
      return { name: "Sales and leads", csv: toCsv(columns, data.rows) }
    }

    case "clients": {
      const data = await getClientsReport(userId, range, now)
      const columns: CsvColumn<(typeof data.rows)[number]>[] = [
        { header: "Client", value: (r) => r.name },
        { header: "Industry", value: (r) => r.industry },
        { header: "Projects", value: (r) => r.projects },
        { header: "Active projects", value: (r) => r.activeProjects },
        { header: "Received", value: (r) => r.revenue },
        { header: "Outstanding", value: (r) => r.outstanding },
        { header: "Invoices", value: (r) => r.documents },
        { header: "Added", value: (r) => r.createdAt },
        { header: "Last activity", value: (r) => r.lastActivityAt },
      ]
      return { name: "Clients", csv: toCsv(columns, data.rows) }
    }

    case "projects": {
      const data = await getProjectsReport(userId, range, now)
      const columns: CsvColumn<(typeof data.rows)[number]>[] = [
        { header: "Project", value: (r) => r.title },
        { header: "Client", value: (r) => r.clientName ?? "No client" },
        { header: "Type", value: (r) => r.category },
        { header: "Stage", value: (r) => r.stageName },
        { header: "Status", value: (r) => r.stageType },
        { header: "Manager", value: (r) => r.managerName ?? "Nobody" },
        { header: "Progress %", value: (r) => r.progress },
        { header: "Value", value: (r) => r.value },
        { header: "Open tasks", value: (r) => r.openTasks },
        { header: "Started", value: (r) => r.startedAt },
        { header: "Deadline", value: (r) => r.deadline },
      ]
      return { name: "Projects", csv: toCsv(columns, data.rows) }
    }

    case "expenses": {
      const data = await getExpensesReport(userId, range, now)
      const columns: CsvColumn<(typeof data.rows)[number]>[] = [
        { header: "Expense", value: (r) => r.title },
        { header: "Category", value: (r) => r.category },
        { header: "Vendor", value: (r) => r.vendor },
        // Overhead is named rather than left blank, so the export can be
        // pivoted by project without the overhead silently vanishing.
        {
          header: "Attributed to",
          value: (r) => (r.scope === "PROJECT" ? (r.projectTitle ?? "Project removed") : "Company overhead"),
        },
        { header: "Department", value: (r) => r.departmentName },
        { header: "Amount", value: (r) => r.amount },
        { header: "Status", value: (r) => r.status },
        { header: "Repeats", value: (r) => r.recurrence },
        { header: "Next due", value: (r) => r.nextDueOn },
        { header: "Date", value: (r) => r.spentOn },
      ]
      return { name: "Expenses", csv: toCsv(columns, data.rows) }
    }

    case "renewals": {
      const data = await getRenewalsReport(userId, range, now)
      const columns: CsvColumn<(typeof data.rows)[number]>[] = [
        { header: "Service", value: (r) => r.name },
        { header: "Kind", value: (r) => KIND_LABEL[r.kind] },
        { header: "Belongs to", value: (r) => r.clientName ?? "Our own" },
        { header: "Project", value: (r) => r.projectTitle },
        { header: "Provider", value: (r) => r.provider },
        { header: "Renews on", value: (r) => r.renewsOn },
        { header: "Cycle", value: (r) => CYCLE_LABEL[r.cycle] },
        { header: "We pay", value: (r) => r.cost },
        { header: "They pay", value: (r) => r.price },
        { header: "Auto renews", value: (r) => r.autoRenew },
        { header: "Status", value: (r) => r.status },
        { header: "Owner", value: (r) => r.ownerName },
        { header: "Last renewed", value: (r) => r.lastRenewedAt },
      ]
      return { name: "Renewals", csv: toCsv(columns, data.rows) }
    }
  }
}
