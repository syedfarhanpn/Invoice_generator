import { BarChart3, Clock, Users } from "lucide-react"

import { requirePermission } from "@/lib/access"
import { GroupedBarChart } from "@/components/app/grouped-bar-chart"
import { AddLead } from "@/components/workspace/add-lead"
import { ImportLeads } from "@/components/workspace/import-leads"
import { DonutChart } from "@/components/app/donut-chart"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { DealTable, type DealRow, type StageColumn } from "@/components/workspace/deal-table"
import type { ClientOption, DealDetailData } from "@/components/workspace/deal-detail"
import { ensureBoard } from "@/lib/boards"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import { toLocalDayKey } from "@/lib/dates"
import prisma from "@/lib/db"
import { formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { getLeadStats } from "@/lib/leads"
import { displayNameFor, getWorkspaceMembers } from "@/lib/members"

export const metadata = { title: "Sales & Leads" }

/**
 * Sales & Leads.
 *
 * The figures and breakdowns above are derived from the same deal rows the
 * table below lists, so a count in a card and a count in a column can never
 * disagree. Inbox, Board and Agenda are kept: they predate the redesign, the
 * board is the card view that was asked for directly, and the reference's
 * status tabs are the same idea as filtering by stage.
 */
export default async function CrmPage() {
  // Server-side, before any query runs. Hiding the nav entry is not
  // access control; this is.
  await requirePermission("sales", "read")

  const identity = await getWorkspaceIdentity()
  const userId = identity.userId

  const [board, stats, members, deals, clients] = await Promise.all([
    ensureBoard(userId, "LEADS"),
    getLeadStats(userId),
    getWorkspaceMembers(identity.orgId),
    prisma.deal.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        value: true,
        currency: true,
        source: true,
        expectedCloseDate: true,
        createdAt: true,
        clientId: true,
        assignedToId: true,
        assignedTo: {
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
        updatedAt: true,
        stage: { select: { id: true, name: true, type: true, position: true } },
        client: { select: { businessName: true, fullName: true } },
        // Email and phone drive the call/mail actions on each row; without
        // them those controls would be decoration.
        primaryContact: {
          select: { firstName: true, lastName: true, email: true, phone: true },
        },
        // When anyone last spoke to them. Only the most recent one.
        activities: {
          orderBy: { occurredAt: "desc" },
          take: 1,
          select: { occurredAt: true },
        },
        // Only the next one: every view shows a single next action per deal.
        tasks: {
          where: { status: "OPEN" },
          orderBy: { dueAt: "asc" },
          take: 1,
          select: { title: true, dueAt: true },
        },
      },
    }),
    prisma.client.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ businessName: "asc" }, { fullName: "asc" }],
      select: { id: true, businessName: true, fullName: true },
    }),
  ])

  const { currency } = stats
  const fallbackCurrency = currency

  const rows: DealRow[] = deals.map((deal) => {
    const next = deal.tasks[0]
    const contact = deal.primaryContact
    return {
      id: deal.id,
      title: deal.title,
      clientName: deal.client?.businessName || deal.client?.fullName || null,
      contactName: contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
        : null,
      value: deal.value != null ? Number(deal.value) : null,
      currency: deal.currency || fallbackCurrency,
      stageId: deal.stage.id,
      stageName: deal.stage.name,
      stageType: deal.stage.type,
      stagePosition: deal.stage.position,
      source: deal.source,
      nextTaskTitle: next?.title ?? null,
      nextTaskDueAt: next?.dueAt ? next.dueAt.toISOString() : null,
      assigneeName: deal.assignedTo ? displayNameFor(deal.assignedTo.user) : null,
      createdAt: deal.createdAt.toISOString(),
      contactEmail: contact?.email ?? null,
      contactPhone: contact?.phone ?? null,
      // The last recorded exchange, falling back to when the row last moved -
      // which is the closest thing to "last touched" that exists.
      lastContactAt: (deal.activities[0]?.occurredAt ?? deal.updatedAt).toISOString(),
    }
  })

  // Everything the editor needs, in the shape the form wants it, so opening a
  // card costs no round trip.
  const details: Record<string, DealDetailData> = Object.fromEntries(
    deals.map((deal) => [
      deal.id,
      {
        id: deal.id,
        title: deal.title,
        clientId: deal.clientId,
        assignedToId: deal.assignedToId,
        value: deal.value != null ? String(Number(deal.value)) : "",
        source: deal.source ?? "",
        expectedCloseDate: toLocalDayKey(deal.expectedCloseDate),
        description: deal.description ?? "",
        nextActionTitle: deal.tasks[0]?.title ?? "",
        nextActionDue: toLocalDayKey(deal.tasks[0]?.dueAt),
      },
    ])
  )

  const clientOptions: ClientOption[] = clients.map((client) => ({
    id: client.id,
    label: client.businessName || client.fullName,
  }))

  const stages: StageColumn[] = board.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    position: stage.position,
    type: stage.type,
  }))

  // Growth of the lead base itself, measured against where it stood at the
  // start of the month. Comparing a running total to a monthly intake count
  // put two different metrics on one card and read as "4 leads, -100%".
  const leadChange = percentChange(stats.total, stats.total - stats.newThisMonth)

  return (
    // Ordinary flow rather than a full-height pane. With the analytics above
    // it, a flex-1 table was squeezed to a sliver and scrolled against the
    // page instead of with it.
    <div className="space-y-4 p-4 md:p-6">
      <div className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sales &amp; Leads</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your leads, follow-ups and conversions all in one place.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ImportLeads stages={stages} />
            <AddLead stages={stages} />
          </div>
        </header>

        <StatRow>
          <StatCard
            variant="overview"
            href="#leads"
            label="Total Leads"
            value={stats.total}
            format="integer"
            icon="clients"
            delta={
              leadChange == null
                ? stats.newThisMonth > 0
                  ? { label: `+${stats.newThisMonth}`, direction: "up", caption: "this month" }
                  : undefined
                : {
                    label: formatDelta(leadChange),
                    direction: leadChange >= 0 ? "up" : "down",
                    caption: "vs last month",
                  }
            }
          />
          <StatCard
            variant="overview"
            href="#leads"
            label="Qualified Leads"
            value={stats.qualified}
            format="integer"
            icon="delivered"
            hint={stats.pipelineValue > 0 ? `${formatCompactAmount(stats.pipelineValue, currency)} in open pipeline` : undefined}
            delta={{
              label: `${stats.open} in play`,
              direction: "flat",
            }}
          />
          <StatCard
            variant="overview"
            href="/dashboard/clients"
            label="Converted Clients"
            value={stats.won}
            format="integer"
            icon="done"
            delta={{
              label: stats.wonValue > 0 ? formatCompactAmount(stats.wonValue, currency) : "no value recorded",
              direction: "flat",
              caption: stats.wonValue > 0 ? "won" : undefined,
            }}
          />
          <StatCard
            variant="overview"
            href="/reports/sales"
            label="Conversion Rate"
            value={stats.conversionRate}
            format="percent"
            icon="money"
            delta={{
              label: stats.total > 0 ? `${stats.won} of ${stats.total}` : "no leads yet",
              direction: "flat",
              caption: stats.total > 0 ? "leads taken on" : undefined,
            }}
          />
        </StatRow>

        <div className="grid gap-4 lg:grid-cols-12">
          <section className="rounded-xl border bg-card p-5 lg:col-span-6">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Leads Trend
              </h2>
              <span className="flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--chart-1)" }} />
                  Total Leads
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--chart-5)" }} />
                  Qualified
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} />
                  Converted
                </span>
                <span className="rounded-md border px-2 py-1 text-muted-foreground">
                  Last 6 months
                </span>
              </span>
            </header>
            <GroupedBarChart
              points={stats.trend.map((m) => ({
                label: m.label,
                total: m.total,
                qualified: m.qualified,
                won: m.won,
              }))}
              series={[
                { key: "total", label: "Total Leads", color: "var(--chart-1)" },
                { key: "qualified", label: "Qualified", color: "var(--chart-5)" },
                { key: "won", label: "Converted", color: "var(--chart-2)" },
              ]}
            />
          </section>

          <section className="rounded-xl border bg-card p-5 lg:col-span-3">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Leads by Source
            </h2>
            <DonutChart slices={stats.bySource} centreLabel="Total Leads" format="integer" />
          </section>

          <section className="rounded-xl border bg-card p-5 lg:col-span-3">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Leads by Status
            </h2>
            <DonutChart slices={stats.byStage} centreLabel="Total Leads" format="integer" />
          </section>
        </div>


      </div>

      <DealTable
        rows={rows}
        stages={stages}
        details={details}
        clients={clientOptions}
        members={members}
      />
    </div>
  )
}
