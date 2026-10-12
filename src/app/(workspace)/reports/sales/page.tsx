import { requirePermission } from "@/lib/access"
import { DonutChart } from "@/components/app/donut-chart"
import { ReportToolbar } from "@/components/app/report-toolbar"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { TrendChart } from "@/components/app/trend-chart"
import { formatShortDay } from "@/lib/dates"
import { formatAmount, formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { getSalesReport } from "@/lib/reports/fetch"
import { describeRange, rangeFromParams, type ReportSearchParams } from "@/lib/reports/params"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

export const metadata = { title: "Sales & Leads report" }

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>
}) {
  await requirePermission("reports", "read")

  const params = await searchParams
  const now = new Date()
  const range = rangeFromParams(params, now)
  const identity = await getWorkspaceIdentity()

  const report = await getSalesReport(identity.userId, range)
  const { currency } = report

  const leadChange = percentChange(report.total, report.previousTotal)
  const wonChange = percentChange(report.won, report.previousWon)

  return (
    <div className="space-y-4">
      <ReportToolbar
        activeKey={range.key}
        from={params.from}
        to={params.to}
        exportKey="sales"
        rangeNote={describeRange(range)}
      />

      <StatRow>
        <StatCard
          label="Leads taken on"
          value={report.total}
          format="integer"
          icon="clients"
          delta={
            leadChange == null
              ? undefined
              : {
                  label: formatDelta(leadChange),
                  direction: leadChange >= 0 ? "up" : "down",
                  caption: range.comparisonLabel ?? undefined,
                }
          }
        />
        <StatCard
          label="Won"
          value={report.won}
          format="integer"
          icon="done"
          delta={
            wonChange == null
              ? undefined
              : {
                  label: formatDelta(wonChange),
                  direction: wonChange >= 0 ? "up" : "down",
                  caption: range.comparisonLabel ?? undefined,
                }
          }
        />
        <StatCard
          label="Conversion"
          value={report.conversionRate}
          format="percent"
          icon="delivered"
          hint="of every lead taken on"
        />
        <StatCard
          label="Pipeline value"
          value={report.pipelineValue}
          format="compactCurrency"
          currency={currency}
          icon="money"
          hint={`${report.open} still open`}
        />
      </StatRow>

      {report.otherCurrencyCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {report.otherCurrencyCount} lead
          {report.otherCurrencyCount === 1 ? " is" : "s are"} priced in another currency and{" "}
          {report.otherCurrencyCount === 1 ? "is" : "are"} left out of the value figures.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Leads over the period</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Taken on each month. {report.won} of {report.total} went on to be won.
          </p>
          <TrendChart
            points={report.trend.map((t) => ({ label: t.label, value: t.total }))}
            format="integer"
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Conversion funnel</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Each step is a subset of the one above, so it can only narrow.
          </p>
          <ul className="space-y-3">
            {report.funnel.map((step) => (
              <li key={step.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{step.label}</span>
                  <span className="tabular-nums">
                    {step.value}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {Math.round(step.share * 100)}%
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{ width: `${Math.max(step.share * 100, 2)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By stage</h2>
          <DonutChart slices={report.byStage} centreLabel="leads" format="integer" />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Where they came from</h2>
          <DonutChart slices={report.bySource} centreLabel="leads" format="integer" />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Outcome</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">Won</dt>
              <dd className="tabular-nums">
                {report.won} · {formatCompactAmount(report.wonValue, currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">Lost</dt>
              <dd className="tabular-nums">{report.lost}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted-foreground">Still open</dt>
              <dd className="tabular-nums">{report.open}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-t pt-3">
              <dt className="text-muted-foreground">Average won deal</dt>
              <dd className="font-medium tabular-nums">
                {formatAmount(report.averageDealValue, currency)}
              </dd>
            </div>
            {report.stalled > 0 && (
              <div className="flex items-baseline justify-between gap-2 border-t pt-3">
                <dt className="text-tone-warning">No next action booked</dt>
                <dd className="font-medium tabular-nums text-tone-warning">{report.stalled}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Salesperson performance</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-normal">Who</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Taken on</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Won</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Lost</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Open</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Conversion</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Won value</th>
              </tr>
            </thead>
            <tbody>
              {report.salespeople.map((person) => (
                <tr key={person.id} className="border-b">
                  <td className="px-4 py-2.5">
                    <span className={person.id === "__unassigned" ? "text-tone-warning" : ""}>
                      {person.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{person.taken}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{person.won}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{person.lost}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{person.open}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {Math.round(person.conversionRate)}%
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatCompactAmount(person.wonValue, currency)}
                  </td>
                </tr>
              ))}
              {report.salespeople.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No leads in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Most recent leads</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-normal">Lead</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Stage</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Source</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Owner</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Value</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Added</th>
              </tr>
            </thead>
            <tbody>
              {report.recent.map((lead) => (
                <tr key={lead.id} className="border-b">
                  <td className="px-4 py-2.5">
                    <span className="block">{lead.title}</span>
                    {lead.clientName && (
                      <span className="block text-xs text-muted-foreground">{lead.clientName}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{lead.stageName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {lead.source ?? "Not recorded"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {lead.ownerName ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {lead.value != null ? formatAmount(lead.value, lead.currency || currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {formatShortDay(lead.createdAt)}
                  </td>
                </tr>
              ))}
              {report.recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No leads in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
