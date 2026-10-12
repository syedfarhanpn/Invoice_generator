import { requirePermission } from "@/lib/access"
import { DonutChart } from "@/components/app/donut-chart"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { ReportToolbar } from "@/components/app/report-toolbar"
import { TrendChart } from "@/components/app/trend-chart"
import { formatShortDay } from "@/lib/dates"
import { formatAmount, formatCompactAmount } from "@/lib/format-compact"
import { getExpensesReport } from "@/lib/reports/fetch"
import { describeRange, rangeFromParams, type ReportSearchParams } from "@/lib/reports/params"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

export const metadata = { title: "Expenses report" }

/**
 * The Expenses report.
 *
 * The brief is explicit that company overhead must be represented explicitly
 * in project-related reports, and that is what the project breakdown does:
 * overhead is a named row, not an omission, so the project-wise view accounts
 * for every rupee and its parts sum to the total above it.
 */
export default async function ExpensesReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>
}) {
  await requirePermission("reports", "read")

  const params = await searchParams
  const now = new Date()
  const range = rangeFromParams(params, now)
  const identity = await getWorkspaceIdentity()

  const report = await getExpensesReport(identity.userId, range, now)
  const { stats, currency } = report

  const settled = stats.total - stats.pendingTotal

  return (
    <div className="space-y-4">
      <ReportToolbar
        activeKey={range.key}
        from={params.from}
        to={params.to}
        exportKey="expenses"
        rangeNote={describeRange(range)}
      />

      <StatRow>
        <StatCard
          label="Total spent"
          value={stats.total}
          format="compactCurrency"
          currency={currency}
          icon="money"
          hint={range.label.toLowerCase()}
        />
        <StatCard
          label="Transactions"
          value={stats.transactionCount}
          format="integer"
          icon="receipt"
          animate={false}
          hint={
            stats.vendorCount > 0
              ? `across ${stats.vendorCount} vendor${stats.vendorCount === 1 ? "" : "s"}`
              : "no vendors recorded"
          }
        />
        <StatCard
          label="Average month"
          value={report.averageMonthly}
          format="compactCurrency"
          currency={currency}
          icon="deadline"
          hint="over months with any spend"
        />
        <StatCard
          label="Unsettled"
          value={stats.pendingTotal}
          format="compactCurrency"
          currency={currency}
          icon="late"
          delta={
            stats.pendingCount > 0
              ? {
                  label: `${stats.pendingCount} awaiting payment`,
                  direction: "flat",
                  inverted: true,
                }
              : { label: "all settled", direction: "flat" }
          }
        />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Spending over the period</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            By month. {formatAmount(settled, currency)} of it settled.
          </p>
          <TrendChart points={report.trend} format="currency" currency={currency} />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By category</h2>
          <DonutChart
            slices={stats.byCategory}
            centreLabel="spent"
            format="compactCurrency"
            currency={currency}
          />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Project cost vs overhead</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Disjoint by design - every expense is one or the other.
          </p>
          <DonutChart
            slices={[
              { label: "Attributed to projects", value: stats.projectTotal },
              { label: "Company overhead", value: stats.overheadTotal },
            ].filter((s) => s.value > 0)}
            centreLabel="spent"
            format="compactCurrency"
            currency={currency}
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By department</h2>
          <DonutChart
            slices={stats.byDepartment}
            centreLabel="spent"
            format="compactCurrency"
            currency={currency}
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">By project</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Overhead is named here rather than dropped, so these add up to the total above.
          </p>
          {stats.byProject.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded in this period.</p>
          ) : (
            <ul className="space-y-3">
              {stats.byProject.slice(0, 7).map((entry) => {
                const share = stats.total > 0 ? entry.value / stats.total : 0
                const overhead = entry.label === "Company overhead"
                return (
                  <li key={entry.label}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate" title={entry.label}>
                        {entry.label}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatCompactAmount(entry.value, currency)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${overhead ? "bg-muted-foreground/50" : "bg-chart-1"}`}
                        style={{ width: `${Math.max(share * 100, 3)}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Payment status</h2>
          <DonutChart
            slices={stats.byStatus.map((s) => ({
              label:
                s.label === "PARTIALLY_PAID"
                  ? "Part paid"
                  : s.label.charAt(0) + s.label.slice(1).toLowerCase(),
              value: s.value,
            }))}
            centreLabel="spent"
            format="compactCurrency"
            currency={currency}
          />
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Recurring commitments</h2>
            <span className="text-xs text-muted-foreground">
              {formatAmount(stats.recurringMonthly, currency)} a month
            </span>
          </header>
          {report.recurring.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recurring in this period.</p>
          ) : (
            <ul className="divide-y text-sm">
              {report.recurring.slice(0, 6).map((row) => (
                <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{row.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.category}
                      {row.nextDueOn && ` · next ${formatShortDay(row.nextDueOn)}`}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatAmount(row.amount, currency)}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {row.recurrence.toLowerCase()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Expenses in this period</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-normal">Expense</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Category</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Attributed to</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Department</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Amount</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Date</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.slice(0, 25).map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="px-4 py-2.5">
                    <span className="block">{row.title}</span>
                    {row.vendor && (
                      <span className="block text-xs text-muted-foreground">{row.vendor}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.category}</td>
                  <td className="px-4 py-2.5">
                    {row.scope === "PROJECT" ? (
                      (row.projectTitle ?? "Project removed")
                    ) : (
                      <span className="text-muted-foreground">Company overhead</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {row.departmentName ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatAmount(row.amount, currency)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {formatShortDay(row.spentOn)}
                  </td>
                </tr>
              ))}
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No expenses recorded in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {report.rows.length > 25 && (
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Showing the 25 most recent of {report.rows.length}. Export for the full list.
          </p>
        )}
      </section>
    </div>
  )
}
