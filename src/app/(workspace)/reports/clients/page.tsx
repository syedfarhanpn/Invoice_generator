import { requirePermission } from "@/lib/access"
import { DonutChart } from "@/components/app/donut-chart"
import { ReportToolbar } from "@/components/app/report-toolbar"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { TrendChart } from "@/components/app/trend-chart"
import { formatShortDay } from "@/lib/dates"
import { formatAmount, formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { getClientsReport } from "@/lib/reports/fetch"
import { describeRange, rangeFromParams, type ReportSearchParams } from "@/lib/reports/params"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

export const metadata = { title: "Clients report" }

/**
 * The Clients report.
 *
 * Revenue here is money RECEIVED, not money invoiced - so a client who owes a
 * fortune does not top the table for having been billed.
 */
export default async function ClientsReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>
}) {
  await requirePermission("reports", "read")

  const params = await searchParams
  const now = new Date()
  const range = rangeFromParams(params, now)
  const identity = await getWorkspaceIdentity()

  const report = await getClientsReport(identity.userId, range, now)
  const { currency } = report

  const addedChange = percentChange(report.added, report.previousAdded)
  const maxRevenue = Math.max(...report.topByRevenue.map((c) => c.revenue), 1)

  return (
    <div className="space-y-4">
      <ReportToolbar
        activeKey={range.key}
        from={params.from}
        to={params.to}
        exportKey="clients"
        rangeNote={describeRange(range)}
      />

      <StatRow>
        <StatCard label="Clients" value={report.total} format="integer" icon="clients" hint="not archived" />
        <StatCard
          label="With live work"
          value={report.active}
          format="integer"
          icon="projects"
          hint="an open project or money owed"
        />
        <StatCard
          label="Added"
          value={report.added}
          format="integer"
          icon="delivered"
          delta={
            addedChange == null
              ? undefined
              : {
                  label: formatDelta(addedChange),
                  direction: addedChange >= 0 ? "up" : "down",
                  caption: range.comparisonLabel ?? undefined,
                }
          }
        />
        <StatCard
          label="Received"
          value={report.revenue}
          format="compactCurrency"
          currency={currency}
          icon="money"
          delta={
            report.outstanding > 0
              ? {
                  label: `${formatCompactAmount(report.outstanding, currency)} outstanding`,
                  direction: "flat",
                  inverted: true,
                }
              : { label: "nothing owed", direction: "flat" }
          }
        />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Client base</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            A running total at each month end, so a quiet month reads as flat rather than as a fall.
          </p>
          <TrendChart
            points={report.growth.map((g) => ({ label: g.label, value: g.total }))}
            format="integer"
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By status</h2>
          <DonutChart slices={report.byStatus} centreLabel="clients" format="integer" />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By industry</h2>
          <DonutChart slices={report.byIndustry} centreLabel="clients" format="integer" />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By project count</h2>
          <DonutChart slices={report.byProjectCount} centreLabel="clients" format="integer" />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Upcoming renewals</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            What is next due for a client. Forward-looking, so it ignores the period above.
          </p>
          {report.upcomingRenewals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing due. Contracts and hosting added under Services show up here.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {report.upcomingRenewals.slice(0, 6).map((renewal) => (
                <li
                  key={renewal.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{renewal.clientName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {renewal.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs tabular-nums text-muted-foreground">
                      {formatShortDay(renewal.renewsOn)}
                    </span>
                    {renewal.price != null && (
                      <span className="block text-xs tabular-nums">
                        {formatCompactAmount(renewal.price, currency)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Revenue spread</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Averaged over clients who have actually paid something.
          </p>
          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">Average client</dt>
              <dd className="font-medium tabular-nums">
                {formatAmount(report.averageRevenue, currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">Best client</dt>
              <dd className="font-medium tabular-nums">
                {report.topByRevenue[0]
                  ? formatAmount(report.topByRevenue[0].revenue, currency)
                  : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-t pt-3">
              <dt className="text-muted-foreground">Nothing recorded yet</dt>
              <dd className="font-medium tabular-nums">{report.dormant.length}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Top clients by revenue</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
          By what they have paid, not by what they have been billed.
        </p>
        {report.topByRevenue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients yet.</p>
        ) : (
          <ul className="space-y-3">
            {report.topByRevenue.map((client) => (
              <li key={client.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate" title={client.name}>
                    {client.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatCompactAmount(client.revenue, currency)}
                    {client.outstanding > 0 && (
                      <span className="ml-2 text-xs text-tone-warning">
                        {formatCompactAmount(client.outstanding, currency)} owed
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{ width: `${Math.max((client.revenue / maxRevenue) * 100, 2)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Every client</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-normal">Client</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Industry</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Projects</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Received</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Outstanding</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.slice(0, 25).map((client) => (
                <tr key={client.id} className="border-b">
                  <td className="px-4 py-2.5">{client.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {client.industry ?? "Not recorded"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {client.projects}
                    {client.activeProjects > 0 && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {client.activeProjects} live
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatAmount(client.revenue, currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {client.outstanding > 0 ? (
                      <span className="text-tone-warning">
                        {formatAmount(client.outstanding, currency)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {client.lastActivityAt ? formatShortDay(client.lastActivityAt) : "—"}
                  </td>
                </tr>
              ))}
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No clients yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {report.rows.length > 25 && (
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Showing 25 of {report.rows.length}. Export for the full list.
          </p>
        )}
      </section>
    </div>
  )
}
