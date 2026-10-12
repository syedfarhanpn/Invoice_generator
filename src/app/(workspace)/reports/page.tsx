import { requirePermission } from "@/lib/access"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { DonutChart } from "@/components/app/donut-chart"
import { ReportToolbar } from "@/components/app/report-toolbar"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { TrendChart } from "@/components/app/trend-chart"
import { formatAmount, formatCompactAmount, percentChange } from "@/lib/format-compact"
import {
  getClientsReport,
  getExpensesReport,
  getProjectsReport,
  getSalesReport,
} from "@/lib/reports/fetch"
import { describeRange, rangeFromParams, type ReportSearchParams } from "@/lib/reports/params"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

export const metadata = { title: "Reports" }

/**
 * The Reports overview.
 *
 * Every figure here is the same calculation the report behind it uses - the
 * five modules are composed rather than re-derived, so a number on this page
 * and the number on the page it links to cannot disagree.
 *
 * Money received and money spent are shown side by side but never summed into
 * a single "profit" figure. Received is cash in from invoices; spent is every
 * expense recorded. They are close enough to a P&L to be tempting and far
 * enough from one to be misleading - a real P&L needs accruals, and the
 * product does not hold them.
 */
export default async function ReportsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>
}) {
  await requirePermission("reports", "read")

  const params = await searchParams
  const now = new Date()
  const range = rangeFromParams(params, now)
  const identity = await getWorkspaceIdentity()

  const [sales, clients, projects, expenses] = await Promise.all([
    getSalesReport(identity.userId, range),
    getClientsReport(identity.userId, range, now),
    getProjectsReport(identity.userId, range, now),
    getExpensesReport(identity.userId, range, now),
  ])

  const currency = clients.currency
  const addedChange = percentChange(clients.added, clients.previousAdded)

  return (
    <div className="space-y-4">
      <ReportToolbar
        activeKey={range.key}
        from={params.from}
        to={params.to}
        rangeNote={describeRange(range)}
      />

      <StatRow>
        <StatCard
          label="Received"
          value={clients.revenue}
          format="compactCurrency"
          currency={currency}
          icon="money"
          delta={
            clients.outstanding > 0
              ? {
                  label: `${formatCompactAmount(clients.outstanding, currency)} outstanding`,
                  direction: "flat",
                  inverted: true,
                }
              : { label: "nothing owed", direction: "flat" }
          }
        />
        <StatCard
          label="Spent"
          value={expenses.stats.total}
          format="compactCurrency"
          currency={currency}
          icon="wallet"
          hint={`${expenses.stats.transactionCount} transaction${expenses.stats.transactionCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Clients"
          value={clients.total}
          format="integer"
          icon="clients"
          delta={
            // The movement describes ADDITIONS, so that is what the label
            // says. Showing a bare "-30%" beside a total of 17 reads as the
            // client base shrinking by a third, which is not what happened
            // and not something this figure can even express.
            addedChange == null
              ? { label: `${clients.added} added`, direction: "flat" }
              : {
                  label: `${clients.added} added`,
                  direction: addedChange >= 0 ? "up" : "down",
                  caption: `vs ${clients.previousAdded} ${range.comparisonLabel?.replace(/^vs /, "") ?? "previously"}`,
                }
          }
        />
        <StatCard
          label="Active projects"
          value={projects.active}
          format="integer"
          icon="projects"
          hint={`${formatCompactAmount(projects.valueInFlight, currency)} in flight`}
        />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Expenses"
          href={`/reports/expenses${params.range ? `?range=${params.range}` : ""}`}
          note="By month across the period."
        >
          <TrendChart points={expenses.trend} format="currency" currency={currency} />
        </ReportCard>

        <ReportCard
          title="Client growth"
          href={`/reports/clients${params.range ? `?range=${params.range}` : ""}`}
          note="A running total at each month end."
        >
          <TrendChart
            points={clients.growth.map((g) => ({ label: g.label, value: g.total }))}
            format="integer"
          />
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportCard
          title="Project status"
          href={`/reports/projects${params.range ? `?range=${params.range}` : ""}`}
        >
          <DonutChart slices={projects.byStatus} centreLabel="projects" format="integer" />
        </ReportCard>

        <ReportCard
          title="Leads"
          href={`/reports/sales${params.range ? `?range=${params.range}` : ""}`}
          note={`${sales.total} taken on, ${Math.round(sales.conversionRate)}% converted.`}
        >
          <DonutChart
            slices={[
              { label: "Won", value: sales.won },
              { label: "Lost", value: sales.lost },
              { label: "Still open", value: sales.open },
            ].filter((s) => s.value > 0)}
            centreLabel="leads"
            format="integer"
          />
        </ReportCard>

        <ReportCard
          title="Expenses by category"
          href={`/reports/expenses${params.range ? `?range=${params.range}` : ""}`}
        >
          {/* Top six only, so the ring is given the true total rather
              than the sum of the six. */}
          <DonutChart
            slices={expenses.stats.byCategory.slice(0, 6)}
            total={expenses.stats.total}
            centreLabel="spent"
            format="compactCurrency"
            currency={currency}
          />
        </ReportCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5">
          <header className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Top clients by revenue</h2>
            <ReportLink href={`/reports/clients${params.range ? `?range=${params.range}` : ""}`} />
          </header>
          {clients.topByRevenue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {clients.topByRevenue.slice(0, 6).map((client) => {
                const max = Math.max(...clients.topByRevenue.map((c) => c.revenue), 1)
                return (
                  <li key={client.id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate" title={client.name}>
                        {client.name}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatCompactAmount(client.revenue, currency)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-1"
                        style={{ width: `${Math.max((client.revenue / max) * 100, 2)}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5">
          <header className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Lead &amp; sales performance</h2>
            <ReportLink href={`/reports/sales${params.range ? `?range=${params.range}` : ""}`} />
          </header>
          {sales.salespeople.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leads in this period.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 font-normal">Who</th>
                  <th scope="col" className="pb-2 text-right font-normal">Taken</th>
                  <th scope="col" className="pb-2 text-right font-normal">Won</th>
                  <th scope="col" className="pb-2 text-right font-normal">Rate</th>
                  <th scope="col" className="pb-2 text-right font-normal">Value</th>
                </tr>
              </thead>
              <tbody>
                {sales.salespeople.slice(0, 6).map((person) => (
                  <tr key={person.id} className="border-b last:border-0">
                    <td className="py-2">
                      <span
                        className={`block truncate ${person.id === "__unassigned" ? "text-tone-warning" : ""}`}
                      >
                        {person.name}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{person.taken}</td>
                    <td className="py-2 text-right tabular-nums">{person.won}</td>
                    <td className="py-2 text-right tabular-nums">
                      {Math.round(person.conversionRate)}%
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCompactAmount(person.wonValue, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Money in and money out</h2>
        <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
          Shown side by side, not subtracted. Received is cash in from invoices; spent is every
          expense recorded. A real profit figure needs accruals this product does not hold, so it
          is not claimed here.
        </p>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Received</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {formatAmount(clients.revenue, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Spent</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {formatAmount(expenses.stats.total, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Still owed to us</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {formatAmount(clients.outstanding, currency)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

function ReportLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      Full report
      <ArrowRight className="size-3" strokeWidth={2} />
    </Link>
  )
}

function ReportCard({
  title,
  href,
  note,
  children,
}: {
  title: string
  href: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
        </div>
        <ReportLink href={href} />
      </header>
      {children}
    </section>
  )
}
