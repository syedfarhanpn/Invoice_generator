import { requirePermission } from "@/lib/access"
import { DonutChart } from "@/components/app/donut-chart"
import { ReportToolbar } from "@/components/app/report-toolbar"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { TrendChart } from "@/components/app/trend-chart"
import { formatShortDay } from "@/lib/dates"
import { formatAmount, formatCompactAmount } from "@/lib/format-compact"
import { CYCLE_LABEL, daysUntil, describeRenewal, KIND_LABEL, URGENCY_LABEL, urgencyOf } from "@/lib/renewals"
import { getRenewalsReport } from "@/lib/reports/fetch"
import { describeRange, rangeFromParams, type ReportSearchParams } from "@/lib/reports/params"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

export const metadata = { title: "Renewals report" }

/**
 * The Renewals report.
 *
 * Scoped by renewal date rather than by when a service was added: the question
 * this answers is "what comes due in this period", which is not the same as
 * "what did we take on".
 */
export default async function RenewalsReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>
}) {
  await requirePermission("reports", "read")

  const params = await searchParams
  const now = new Date()
  const range = rangeFromParams(params, now)
  const identity = await getWorkspaceIdentity()

  const report = await getRenewalsReport(identity.userId, range, now)
  const { stats, currency } = report

  const withDays = report.rows.map((row) => {
    const days = daysUntil(row.renewsOn, now)
    return { ...row, days, urgency: urgencyOf(days) }
  })

  const expired = withDays.filter((r) => r.urgency === "overdue" && r.status === "ACTIVE")
  const upcoming = withDays.filter((r) => r.urgency !== "overdue" && r.status === "ACTIVE")

  return (
    <div className="space-y-4">
      <ReportToolbar
        activeKey={range.key}
        from={params.from}
        to={params.to}
        exportKey="renewals"
        rangeNote={describeRange(range)}
      />

      <StatRow>
        <StatCard
          label="Coming due"
          value={stats.total}
          format="integer"
          icon="deadline"
          animate={false}
          hint={`${stats.activeCount} active, ${stats.cancelledCount} lapsing`}
        />
        <StatCard
          label="Renewed"
          value={report.renewed}
          format="integer"
          icon="done"
          animate={false}
          hint="put through in this period"
        />
        <StatCard
          label="Overdue"
          value={stats.overdueCount}
          format="integer"
          icon="late"
          animate={false}
          delta={
            stats.overdueCount > 0
              ? { label: "past the renewal date", direction: "flat", inverted: true }
              : { label: "nothing lapsed", direction: "flat" }
          }
        />
        <StatCard
          label="Worth per year"
          value={stats.annualRevenue}
          format="compactCurrency"
          currency={currency}
          icon="money"
          hint="recurring revenue, annualised"
        />
      </StatRow>

      {stats.otherCurrencyCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.otherCurrencyCount} service
          {stats.otherCurrencyCount === 1 ? " is" : "s are"} in another currency and{" "}
          {stats.otherCurrencyCount === 1 ? "is" : "are"} left out of the money figures.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Renewals falling due</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            By the month they come up, so a heavy month can be planned for.
          </p>
          <TrendChart points={report.trend} format="integer" />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By service type</h2>
          <DonutChart slices={stats.byKind} centreLabel="services" format="integer" />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Urgency</h2>
          <DonutChart
            slices={stats.byUrgency.map((u) => ({
              label: URGENCY_LABEL[u.urgency],
              value: u.count,
            }))}
            centreLabel="services"
            format="integer"
          />
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">The money, per year</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Revenue and cost are kept apart. Margin covers resold services only - our own
            infrastructure is overhead, not a loss-making resale.
          </p>
          <dl className="grid gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Clients pay</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatCompactAmount(stats.annualRevenue, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Resale cost</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatCompactAmount(stats.annualCostResold, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Margin</dt>
              <dd
                className={`mt-1 text-xl font-semibold tabular-nums ${
                  stats.annualMargin < 0 ? "text-tone-danger" : "text-tone-success"
                }`}
              >
                {formatCompactAmount(stats.annualMargin, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Our own</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {formatCompactAmount(stats.annualCostOwn, currency)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {expired.length > 0 && (
        <section className="rounded-xl border border-tone-danger/30 bg-card">
          <header className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-tone-danger">Expired and not renewed</h2>
          </header>
          <ul className="divide-y text-sm">
            {expired.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate">{row.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {KIND_LABEL[row.kind]} · {row.clientName ?? "Our own"}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-tone-danger">
                  {formatShortDay(row.renewsOn)} · {describeRenewal(row.days)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Renewals in this period</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-normal">Service</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Belongs to</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Renews</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Cycle</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">We pay</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">They pay</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="px-4 py-2.5">
                    <span className="block">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {KIND_LABEL[row.kind]}
                      {row.provider && ` · ${row.provider}`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.clientName ?? <span className="text-muted-foreground">Our own</span>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {formatShortDay(row.renewsOn)}
                    <span className="block text-xs text-muted-foreground">
                      {describeRenewal(row.days)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{CYCLE_LABEL[row.cycle]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.cost != null ? formatAmount(row.cost, currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {row.price != null ? formatAmount(row.price, currency) : "—"}
                  </td>
                </tr>
              ))}
              {upcoming.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nothing comes due in this period.
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
