import { requirePermission } from "@/lib/access"
import { DonutChart } from "@/components/app/donut-chart"
import { ReportToolbar } from "@/components/app/report-toolbar"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { TrendChart } from "@/components/app/trend-chart"
import { formatShortDay } from "@/lib/dates"
import { formatAmount, formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { getProjectsReport } from "@/lib/reports/fetch"
import { describeRange, rangeFromParams, type ReportSearchParams } from "@/lib/reports/params"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

export const metadata = { title: "Projects report" }

/**
 * The Projects report.
 *
 * Status comes from the board's stage type, so renaming a column never breaks
 * these counts. "On hold" has no stage of its own, so rather than inventing
 * one this reports STALLED - started, still open, untouched for a month.
 * That is observable; a hold nobody recorded is not.
 */
export default async function ProjectsReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportSearchParams>
}) {
  await requirePermission("reports", "read")

  const params = await searchParams
  const now = new Date()
  const range = rangeFromParams(params, now)
  const identity = await getWorkspaceIdentity()

  const report = await getProjectsReport(identity.userId, range, now)
  const { currency } = report

  const startedChange = percentChange(report.started, report.previousStarted)

  return (
    <div className="space-y-4">
      <ReportToolbar
        activeKey={range.key}
        from={params.from}
        to={params.to}
        exportKey="projects"
        rangeNote={describeRange(range)}
      />

      <StatRow>
        <StatCard
          label="Active"
          value={report.active}
          format="integer"
          icon="projects"
          delta={
            report.late > 0
              ? { label: `${report.late} past deadline`, direction: "flat", inverted: true }
              : { label: "none overdue", direction: "flat" }
          }
        />
        <StatCard
          label="Value in flight"
          value={report.valueInFlight}
          format="compactCurrency"
          currency={currency}
          icon="money"
          hint={
            report.averageProgress != null
              ? `${Math.round(report.averageProgress)}% average progress`
              : "no progress recorded"
          }
        />
        <StatCard
          label="Started"
          value={report.started}
          format="integer"
          icon="delivered"
          delta={
            startedChange == null
              ? undefined
              : {
                  label: formatDelta(startedChange),
                  direction: startedChange >= 0 ? "up" : "down",
                  caption: range.comparisonLabel ?? undefined,
                }
          }
        />
        <StatCard
          label="Delivered"
          value={report.delivered}
          format="integer"
          icon="done"
          hint={`${formatCompactAmount(report.deliveredValue, currency)} delivered`}
        />
      </StatRow>

      {(report.stalled > 0 || report.unmanaged > 0) && (
        <p className="text-xs text-muted-foreground">
          {report.stalled > 0 && (
            <>
              <span className="text-tone-warning">{report.stalled}</span> started and untouched for
              a month
            </>
          )}
          {report.stalled > 0 && report.unmanaged > 0 && " · "}
          {report.unmanaged > 0 && (
            <>
              <span className="text-tone-warning">{report.unmanaged}</span> with nobody managing
              delivery
            </>
          )}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Started over the period</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            New work taken on each month.
          </p>
          <TrendChart
            points={report.trend.map((t) => ({ label: t.label, value: t.started }))}
            format="integer"
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By status</h2>
          <DonutChart slices={report.byStatus} centreLabel="projects" format="integer" />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By type</h2>
          <DonutChart slices={report.byCategory} centreLabel="projects" format="integer" />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By client</h2>
          {/* The slice list is capped at the top eight, so the ring is told
              the real total explicitly - otherwise its centre reports the sum
              of what survived the cap and contradicts every other count on
              the page. */}
          <DonutChart
            slices={report.byClient}
            total={report.total}
            centreLabel="projects"
            format="integer"
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Upcoming deadlines</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">Soonest first.</p>
          {report.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing with a deadline set.</p>
          ) : (
            <ul className="divide-y text-sm">
              {report.upcoming.slice(0, 6).map((project) => {
                const late = project.deadline!.getTime() < now.getTime()
                return (
                  <li
                    key={project.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                  >
                    <span className="min-w-0 truncate" title={project.title}>
                      {project.title}
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums ${late ? "text-tone-danger" : "text-muted-foreground"}`}
                    >
                      {formatShortDay(project.deadline)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Team workload</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-normal">Who</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Active</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Delivered</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Open tasks</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Value in flight</th>
              </tr>
            </thead>
            <tbody>
              {report.workload.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="px-4 py-2.5">
                    <span className={row.id === "__unmanaged" ? "text-tone-warning" : ""}>
                      {row.name}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.active}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.delivered}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.openTasks}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatCompactAmount(row.valueInFlight, currency)}
                  </td>
                </tr>
              ))}
              {report.workload.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Every project</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-normal">Project</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Client</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Stage</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Manager</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Progress</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Value</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.slice(0, 25).map((project) => (
                <tr key={project.id} className="border-b">
                  <td className="px-4 py-2.5">{project.title}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {project.clientName ?? "No client"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{project.stageName}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {project.managerName ?? "Nobody"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {project.progress != null ? `${project.progress}%` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {project.value != null ? formatAmount(project.value, currency) : "—"}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {project.deadline ? formatShortDay(project.deadline) : "—"}
                  </td>
                </tr>
              ))}
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No projects yet.
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
