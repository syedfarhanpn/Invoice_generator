import { BarChart3, Briefcase, CircleDot } from "lucide-react"

import { DonutChart } from "@/components/app/donut-chart"
import { GroupedBarChart } from "@/components/app/grouped-bar-chart"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { AddProject } from "@/components/workspace/add-project"
import type { ClientOption } from "@/components/workspace/deal-detail"
import type { ProjectRow } from "@/components/workspace/projects-list-view"
import { requirePermission } from "@/lib/access"
import { ensureBoard } from "@/lib/boards"
import { toLocalDayKey } from "@/lib/dates"
import prisma from "@/lib/db"
import { formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { displayNameFor, getWorkspaceMembers } from "@/lib/members"
import { getProjectStats } from "@/lib/project-stats"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { ProjectsPanel, type ProjectDetailData, type ProjectStage } from "./projects-panel"

export const metadata = { title: "Projects" }

/**
 * Projects, laid out as the reference dashboard.
 *
 * The columns belong to the operator - seeded once with Onboarding through
 * Completed and editable in Preferences - so nothing here assumes a delivery
 * process it was not told about. "Status" everywhere on this page means the
 * name of the column a project sits in, which is the only definition of
 * status the product has.
 *
 * Every figure is derived from the same rows the list and the board draw, so
 * a card count and a column count cannot disagree.
 */
export default async function ProjectsPage() {
  // Server-side, before any query runs. Hiding the nav entry is not
  // access control; this is.
  await requirePermission("projects", "read")

  const identity = await getWorkspaceIdentity()
  const userId = identity.userId

  const [board, stats, members, projects, clients] = await Promise.all([
    ensureBoard(userId, "PROJECTS"),
    getProjectStats(userId),
    getWorkspaceMembers(identity.orgId),
    prisma.project.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ position: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        stageId: true,
        position: true,
        value: true,
        currency: true,
        startedAt: true,
        createdAt: true,
        deadline: true,
        clientId: true,
        managerId: true,
        category: true,
        progress: true,
        client: { select: { businessName: true, fullName: true } },
        manager: {
          select: {
            user: {
              select: {
                email: true,
                name: true,
                businessProfile: { select: { ownerName: true } },
              },
            },
          },
        },
        sourceDeal: { select: { title: true } },
        stage: { select: { name: true, type: true, position: true } },
        _count: { select: { tasks: true } },
        tasks: { where: { status: "OPEN" }, select: { id: true } },
      },
    }),
    prisma.client.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ businessName: "asc" }, { fullName: "asc" }],
      select: { id: true, businessName: true, fullName: true },
    }),
  ])

  const { currency } = stats

  const stages: ProjectStage[] = board.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    position: stage.position,
    type: stage.type,
  }))

  const rows: ProjectRow[] = projects.map((project) => ({
    id: project.id,
    title: project.title,
    clientId: project.clientId,
    clientName: project.client?.businessName || project.client?.fullName || null,
    category: project.category,
    stageId: project.stageId,
    stageName: project.stage.name,
    stageType: project.stage.type,
    stagePosition: project.stage.position,
    managerName: project.manager ? displayNameFor(project.manager.user) : null,
    // The same substitution the reports make: a recorded start when there is
    // one, otherwise when the card was made.
    startedAt: (project.startedAt ?? project.createdAt).toISOString(),
    deadline: project.deadline ? project.deadline.toISOString() : null,
    progress: project.progress,
    value: project.value != null ? Number(project.value) : null,
    currency: project.currency || currency,
    openTasks: project.tasks.length,
    taskCount: project._count.tasks,
  }))

  const details: Record<string, ProjectDetailData> = Object.fromEntries(
    projects.map((project) => [
      project.id,
      {
        id: project.id,
        title: project.title,
        clientId: project.clientId,
        managerId: project.managerId,
        category: project.category ?? "",
        progress: project.progress != null ? String(project.progress) : "",
        value: project.value != null ? String(Number(project.value)) : "",
        startedAt: toLocalDayKey(project.startedAt),
        deadline: toLocalDayKey(project.deadline),
        description: project.description ?? "",
        sourceDealTitle: project.sourceDeal?.title ?? null,
      },
    ])
  )

  const clientOptions: ClientOption[] = clients.map((client) => ({
    id: client.id,
    label: client.businessName || client.fullName,
  }))

  // A floor of five: a workspace that held one project last month and holds
  // twenty-one now is "+2000%", which is true and unreadable. Below the floor
  // the card shows how many were added instead.
  const projectChange = percentChange(stats.total, stats.total - stats.newThisMonth, 5)

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage all your client projects from start to finish.
          </p>
        </div>
        <AddProject stages={stages} />
      </header>

      <StatRow>
        <StatCard
          variant="overview"
          href="#projects"
          label="Total Projects"
          value={stats.total}
          format="integer"
          icon="projects"
          delta={
            projectChange == null
              ? stats.newThisMonth > 0
                ? { label: `+${stats.newThisMonth}`, direction: "up", caption: "this month" }
                : undefined
              : {
                  label: formatDelta(projectChange),
                  direction: projectChange >= 0 ? "up" : "down",
                  caption: "vs last month",
                }
          }
        />
        <StatCard
          variant="overview"
          href="#projects"
          label="Active Projects"
          value={stats.active}
          format="integer"
          icon="done"
          delta={{
            label:
              stats.valueInFlight > 0
                ? `${formatCompactAmount(stats.valueInFlight, currency)} in flight`
                : "no value recorded",
            direction: "flat",
            caption:
              stats.averageProgress != null
                ? `${stats.averageProgress}% average progress`
                : undefined,
          }}
        />
        <StatCard
          variant="overview"
          href="/reports/projects"
          label="Completed Projects"
          value={stats.delivered}
          format="integer"
          icon="delivered"
          delta={{
            label:
              stats.deliveredValue > 0
                ? formatCompactAmount(stats.deliveredValue, currency)
                : "no value recorded",
            direction: "flat",
            caption: stats.deliveredValue > 0 ? "delivered" : undefined,
          }}
        />
        {/* The reference's fourth card counts projects "on hold". Nothing in
            this schema records a hold, and inventing one would be a number
            with no source. Past deadline is the real version of the same
            question: which active work needs a decision today. */}
        <StatCard
          variant="overview"
          href="#projects"
          label="Past Deadline"
          value={stats.late}
          format="integer"
          icon="deadline"
          delta={
            stats.late > 0
              ? { label: "needs attention", direction: "flat", inverted: true }
              : { label: "all on time", direction: "flat" }
          }
        />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-xl border bg-card p-5 lg:col-span-6">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Projects Trend
            </h2>
            <span className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: "var(--chart-1)" }} />
                New
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: "var(--chart-5)" }} />
                In Progress
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} />
                Completed
              </span>
              <span className="rounded-md border px-2 py-1 text-muted-foreground">
                Last 6 months
              </span>
            </span>
          </header>
          <GroupedBarChart
            points={stats.trend.map((m) => ({
              label: m.label,
              started: m.started,
              inProgress: m.inProgress,
              completed: m.completed,
            }))}
            series={[
              { key: "started", label: "New", color: "var(--chart-1)" },
              { key: "inProgress", label: "In Progress", color: "var(--chart-5)" },
              { key: "completed", label: "Completed", color: "var(--chart-2)" },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            In Progress counts what was still open at the end of each month, not what was touched
            during it.
          </p>
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-3">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Briefcase className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Projects by Type
          </h2>
          <DonutChart slices={stats.byCategory} centreLabel="Projects" format="integer" />
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-3">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <CircleDot className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Projects by Status
          </h2>
          <DonutChart slices={stats.byStage} centreLabel="Projects" format="integer" />
        </section>
      </div>

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5">
          <h2 className="text-sm font-semibold">Team workload</h2>
          {stats.unmanaged > 0 && (
            <span className="text-xs text-tone-warning">
              {stats.unmanaged} active project{stats.unmanaged === 1 ? "" : "s"} with no manager
            </span>
          )}
        </header>
        {stats.workload.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No project has a manager yet. Open one and set a manager to see workload here.
          </p>
        ) : (
          <ul className="divide-y">
            {stats.workload.map((row) => (
              <li key={row.memberId} className="flex items-center gap-3 px-5 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {row.initials}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {row.active} active · {row.delivered} delivered · {row.openTasks} open tasks
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div id="projects" className="scroll-mt-20">
        <ProjectsPanel
          rows={rows}
          stages={stages}
          details={details}
          clients={clientOptions}
          members={members}
          currency={currency}
        />
      </div>
    </div>
  )
}
