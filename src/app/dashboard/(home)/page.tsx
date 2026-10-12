import Link from "next/link"
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckSquare,
  FileText,
  FolderOpen,
  MessageSquare,
  RefreshCw,
  Users,
} from "lucide-react"

import { DonutChart } from "@/components/app/donut-chart"
import { RevenueExpenseChart } from "@/components/app/revenue-expense-chart"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { viewerMatrix } from "@/lib/access"
import { getDashboardData } from "@/lib/dashboard"
import { getDashboardPanels } from "@/lib/dashboard-panels"

import { formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import type { Module } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { RenewalsPanel } from "./renewals-panel"

export const metadata = { title: "Overview" }

/**
 * The Overview, laid out as the reference dashboard.
 *
 * Every figure is read from the rows that define it - revenue from payments
 * received rather than invoices raised, outstanding through the same
 * paymentSummary() the per-invoice badge uses - so this screen and the module
 * behind each panel can never tell different stories. The reference's sample
 * values are not reproduced anywhere; the layout is the reference, the numbers
 * are the workspace's own.
 *
 * Each panel is still shown only to someone who could open the module behind
 * it. Without that a developer with no access to Documents would read the
 * revenue figure off the front page.
 */

/** IST, because the greeting is about the operator's day, not the server's. */
const IST_HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  hour12: false,
})

function greeting(now: Date): string {
  const hour = Number(IST_HOUR.format(now))
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

/** The reference greets by first name; a full name reads like a letterhead. */
function firstName(displayName: string | null, email: string): string {
  const source = displayName?.trim() || email.split("@")[0]
  return source.split(/\s+/)[0]
}

/** "25 Oct 2025", as the reference table shows due dates. */
const DUE_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
})

const STATUS_TONE: Record<string, string> = {
  OPEN: "bg-tone-info-bg text-tone-info",
  IN_PROGRESS: "bg-tone-special-bg text-tone-special",
  WAITING_ON_CLIENT: "bg-tone-warning-bg text-tone-warning",
  RESOLVED: "bg-tone-success-bg text-tone-success",
}

const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-tone-danger",
  HIGH: "bg-tone-warning",
  NORMAL: "bg-tone-info",
  LOW: "bg-muted-foreground/40",
}

const ACTIVITY_DOT: Record<string, string> = {
  payment: "bg-tone-success",
  document: "bg-chart-1",
  project: "bg-tone-special",
  client: "bg-tone-info",
}

export default async function OverviewPage() {
  const identity = await getWorkspaceIdentity()
  const now = new Date()

  const matrix = await viewerMatrix()
  const sees = (m: Module) => matrix != null && matrix[m] !== "none"

  const [data, panels] = await Promise.all([
    getDashboardData(identity.userId, now),
    getDashboardPanels(identity.userId, now),
  ])

  const { currency } = data
  const revenueChange = percentChange(data.revenue.current, data.revenue.previous)

  const series = data.monthlyRevenue.map((month, i) => ({
    label: month.label,
    revenue: month.revenue,
    expenses: panels.monthlyExpenses[i]?.expenses ?? 0,
  }))

  const totalClients = panels.clientDistribution.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting(now)}, {firstName(identity.displayName, identity.email)}!
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your business today.
        </p>
      </header>

      <StatRow>
        {sees("documents") && (
          <StatCard
            variant="overview"
            href="/dashboard/documents"
            label="Total Revenue"
            value={data.revenue.current}
            format="currency"
            currency={currency}
            icon="wallet"
            delta={
              revenueChange == null
                ? undefined
                : {
                    label: formatDelta(revenueChange),
                    direction: revenueChange >= 0 ? "up" : "down",
                    caption: "vs last month",
                  }
            }
          />
        )}
        {sees("documents") && (
          <StatCard
            variant="overview"
            href="/dashboard/documents?filter=outstanding"
            label="Outstanding Invoices"
            value={data.outstanding.amount}
            format="currency"
            currency={currency}
            icon="receipt"
            delta={{
              label:
                data.outstanding.overdueCount > 0
                  ? `${formatCompactAmount(data.outstanding.overdueAmount, currency)} overdue`
                  : "nothing overdue",
              direction: "flat",
              inverted: data.outstanding.overdueCount > 0,
              caption: `across ${data.outstanding.invoiceCount} invoice${data.outstanding.invoiceCount === 1 ? "" : "s"}`,
            }}
          />
        )}
        {sees("clients") && (
          <StatCard
            variant="overview"
            href="/dashboard/clients"
            label="Active Clients"
            value={data.clients.active}
            format="integer"
            icon="clients"
            delta={{
              label: `+${data.clients.newThisMonth}`,
              direction: data.clients.newThisMonth > 0 ? "up" : "flat",
              caption: "new this month",
            }}
          />
        )}
        {sees("projects") && (
          <StatCard
            variant="overview"
            href="/projects"
            label="Active Projects"
            value={data.projects.active}
            format="integer"
            icon="projects"
            delta={{
              label: `+${data.projects.newThisMonth}`,
              direction: data.projects.newThisMonth > 0 ? "up" : "flat",
              caption: "started this month",
            }}
          />
        )}
      </StatRow>

      {/* Row two: the money series, how the work is distributed, who it is for. */}
      <div className="grid gap-4 lg:grid-cols-12">
        {sees("documents") && (
          <section className="rounded-xl border bg-card p-5 lg:col-span-6">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Revenue &amp; Expenses
              </h2>
              <span className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--chart-1)" }} />
                  Revenue
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} />
                  Expenses
                </span>
                <span className="rounded-md border px-2 py-1 text-muted-foreground">
                  Last 6 months
                </span>
              </span>
            </header>
            <RevenueExpenseChart points={series} currency={currency} />
          </section>
        )}

        {sees("projects") && (
          <section className="rounded-xl border bg-card p-5 lg:col-span-3">
            <header className="mb-4 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FolderOpen className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Project Status
              </h2>
              <ViewAll href="/projects" />
            </header>

            {data.projectsByStage.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects yet. Starting one from a won lead carries its client and value across.
              </p>
            ) : (
              <ul className="space-y-3.5">
                {data.projectsByStage.map((stage) => (
                  <li key={stage.label}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{stage.label}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {stage.value}
                        <span className="ml-2">{Math.round(stage.share * 100)}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-1"
                        style={{ width: `${Math.max(stage.share * 100, stage.value ? 3 : 0)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {sees("clients") && (
          <section className="rounded-xl border bg-card p-5 lg:col-span-3">
            <header className="mb-4 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Client Distribution
              </h2>
              <ViewAll href="/dashboard/clients" />
            </header>

            {totalClients === 0 ? (
              <p className="text-sm text-muted-foreground">No clients yet.</p>
            ) : (
              <DonutChart
                slices={panels.clientDistribution}
                centreLabel="Clients"
                format="integer"
              />
            )}
          </section>
        )}
      </div>

      {/* Row three: the work in flight, and what falls due. */}
      <div className="grid gap-4 lg:grid-cols-12">
        {sees("projects") && (
          <section className="rounded-xl border bg-card lg:col-span-7">
            <header className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FolderOpen className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Recent Projects
              </h2>
              <ViewAll href="/projects" />
            </header>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="w-10 px-5 py-2.5 font-normal">#</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Project Name</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Client</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Category</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Progress</th>
                    <th scope="col" className="px-5 py-2.5 font-normal">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentProjects.map((project, i) => (
                    <tr key={project.id} className="border-b last:border-0">
                      <td className="px-5 py-3 text-muted-foreground tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href="/projects"
                          className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {project.title}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {project.clientName ?? "No client"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {project.category ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            project.stageType === "WON"
                              ? "bg-tone-success-bg text-tone-success"
                              : project.stageType === "LOST"
                                ? "bg-tone-danger-bg text-tone-danger"
                                : "bg-tone-info-bg text-tone-info"
                          )}
                        >
                          {project.stageName}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {project.progress == null ? (
                          <span className="text-xs text-muted-foreground">Not set</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <span
                                className={cn(
                                  "block h-full rounded-full",
                                  project.progress >= 100 ? "bg-tone-success" : "bg-chart-1"
                                )}
                                style={{ width: `${Math.max(project.progress, 3)}%` }}
                              />
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {project.progress}%
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                        {project.deadline ? DUE_DATE.format(project.deadline) : "—"}
                      </td>
                    </tr>
                  ))}

                  {data.recentProjects.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                        No projects yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(sees("renewals") || sees("domains")) && (
          <section className="rounded-xl border bg-card lg:col-span-5">
            <header className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <RefreshCw className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Upcoming Renewals
              </h2>
              <ViewAll href="/renewals" />
            </header>
            <RenewalsPanel amc={panels.amcRenewals} infrastructure={panels.infrastructureRenewals} />
          </section>
        )}
      </div>

      {/* Row four: the day itself. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {sees("tasks") && (
          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CheckSquare className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Today&apos;s Tasks &amp; Review Meetings
              </h2>
              <ViewAll href="/tasks" />
            </header>

            {panels.todaysTasks.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nothing scheduled for today.
              </p>
            ) : (
              <ul className="divide-y">
                {panels.todaysTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0 rounded border",
                        task.done && "border-tone-success bg-tone-success-bg"
                      )}
                    />
                    <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {task.timeLabel}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", task.done && "line-through opacity-60")}>
                      {task.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{task.context}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {sees("tickets") && (
          <section className="rounded-xl border bg-card">
            <header className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Recent Ticket Inbox
              </h2>
              <ViewAll href="/tickets" />
            </header>

            {panels.recentTickets.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No open tickets.
              </p>
            ) : (
              <ul className="divide-y">
                {panels.recentTickets.map((ticket) => (
                  <li key={ticket.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        PRIORITY_DOT[ticket.priority] ?? "bg-muted-foreground/40"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{ticket.subject}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {ticket.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ticket.ago}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                        STATUS_TONE[ticket.status] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      {ticket.statusLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-xl border bg-card">
          <header className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Recent Activity
            </h2>
          </header>

          {panels.recentActivity.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nothing has happened yet.
            </p>
          ) : (
            <ul className="divide-y">
              {panels.recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", ACTIVITY_DOT[entry.kind])}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{entry.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.detail}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{entry.ago}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {data.isEmpty && (
        <section className="rounded-xl border border-dashed bg-card/40 px-5 py-8 text-center">
          <FileText className="mx-auto size-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a client, then raise their first document. The figures above fill in as you go.
          </p>
        </section>
      )}
    </div>
  )
}

/** The "View all →" the reference puts on every panel header. */
function ViewAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      View all
      <ArrowRight className="size-3.5" strokeWidth={2} />
    </Link>
  )
}
