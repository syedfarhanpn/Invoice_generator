import { requirePermission } from "@/lib/access"
import { DonutChart } from "@/components/app/donut-chart"
import { PageHeader } from "@/components/app/page-header"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { formatLocalTime, formatShortDay } from "@/lib/dates"
import prisma from "@/lib/db"
import { displayNameFor } from "@/lib/member-names"
import { getWorkspaceMembers } from "@/lib/members"
import {
  describeHours,
  PRIORITY_LABEL,
  SETTLED,
  STATUS_LABEL,
  summariseTickets,
  ticketRef,
} from "@/lib/ticket-summary"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { TicketsView, type Option, type TicketViewRow } from "./tickets-view"

export const metadata = { title: "Support Tickets" }

const HOUR_MS = 3_600_000

/** How long ago, in the words someone would use. */
function ageLabel(createdAt: Date, now: Date): string {
  const hours = (now.getTime() - createdAt.getTime()) / HOUR_MS
  if (hours < 1) return "just now"
  return `${describeHours(hours)} ago`
}

/**
 * Support tickets.
 *
 * The queue defaults to what needs us. A ticket waiting on the client is still
 * open, but it is not work - keeping the two apart is the point of the module,
 * and the figures above follow the same split.
 */
export default async function TicketsPage() {
  // Server-side, before any query runs. Hiding the nav entry is not
  // access control; this is.
  await requirePermission("tickets", "read")

  const identity = await getWorkspaceIdentity()
  const now = new Date()

  const [tickets, clients, projects, members] = await Promise.all([
    prisma.ticket.findMany({
      where: { userId: identity.userId, archivedAt: null },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        number: true,
        subject: true,
        body: true,
        status: true,
        priority: true,
        channel: true,
        dueAt: true,
        firstRespondedAt: true,
        resolvedAt: true,
        createdAt: true,
        clientId: true,
        projectId: true,
        assigneeId: true,
        client: { select: { businessName: true, fullName: true } },
        project: { select: { title: true } },
        assignee: {
          select: {
            user: {
              select: { name: true, email: true, businessProfile: { select: { ownerName: true } } },
            },
          },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            body: true,
            fromClient: true,
            visibility: true,
            createdAt: true,
            author: {
              select: {
                user: {
                  select: {
                    name: true,
                    email: true,
                    businessProfile: { select: { ownerName: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.client.findMany({
      where: { userId: identity.userId, archivedAt: null },
      orderBy: { businessName: "asc" },
      select: { id: true, businessName: true, fullName: true },
    }),
    prisma.project.findMany({
      where: { userId: identity.userId, archivedAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    getWorkspaceMembers(identity.orgId),
  ])

  const stats = summariseTickets(
    tickets.map((t) => ({
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      dueAt: t.dueAt,
      firstRespondedAt: t.firstRespondedAt,
      resolvedAt: t.resolvedAt,
      assigneeId: t.assigneeId,
    })),
    now
  )

  const rows: TicketViewRow[] = tickets.map((t) => {
    const settled = SETTLED.includes(t.status)
    return {
      id: t.id,
      ref: ticketRef(t.number),
      subject: t.subject,
      body: t.body,
      clientId: t.clientId,
      clientName: t.client?.businessName || t.client?.fullName || null,
      projectId: t.projectId,
      projectTitle: t.project?.title ?? null,
      status: t.status,
      statusLabel: STATUS_LABEL[t.status],
      priority: t.priority,
      priorityLabel: PRIORITY_LABEL[t.priority],
      channel: t.channel,
      assigneeId: t.assigneeId,
      assigneeName: t.assignee ? displayNameFor(t.assignee.user) : null,
      // The datetime-local control wants "YYYY-MM-DDTHH:mm" with no zone.
      dueAt: t.dueAt ? t.dueAt.toISOString().slice(0, 16) : null,
      dueLabel: t.dueAt ? `${formatShortDay(t.dueAt)}, ${formatLocalTime(t.dueAt)}` : null,
      // Overdue only means something while someone still owes a reply - the
      // same rule the figures above use.
      overdue: !settled && !!t.dueAt && t.dueAt.getTime() < now.getTime(),
      settled,
      createdLabel: formatShortDay(t.createdAt),
      ageLabel: ageLabel(t.createdAt, now),
      firstResponseLabel: t.firstRespondedAt
        ? describeHours((t.firstRespondedAt.getTime() - t.createdAt.getTime()) / HOUR_MS)
        : null,
      replies: t.replies.map((r) => ({
        id: r.id,
        body: r.body,
        fromClient: r.fromClient,
        internal: r.visibility === "INTERNAL",
        authorName: r.author ? displayNameFor(r.author.user) : null,
        whenLabel: `${formatShortDay(r.createdAt)}, ${formatLocalTime(r.createdAt)}`,
      })),
    }
  })

  const clientOptions: Option[] = clients.map((c) => ({
    id: c.id,
    label: c.businessName || c.fullName,
  }))
  const projectOptions: Option[] = projects.map((p) => ({ id: p.id, label: p.title }))
  const memberOptions: Option[] = members.map((m) => ({ id: m.id, label: m.name }))

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Support Tickets" trail={[{ label: "Support Tickets" }]} />

      <StatRow>
        <StatCard
          label="Needs us"
          value={stats.needsUs}
          format="integer"
          icon="tasks"
          animate={false}
          delta={
            stats.unassigned > 0
              ? { label: `${stats.unassigned} unassigned`, direction: "flat", inverted: true }
              : stats.needsUs > 0
                ? { label: "all assigned", direction: "flat" }
                : { label: "queue is clear", direction: "flat" }
          }
        />
        <StatCard
          label="Waiting on client"
          value={stats.waitingOnClient}
          format="integer"
          icon="due"
          animate={false}
          hint="not counted as work"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          format="integer"
          icon="late"
          animate={false}
          delta={
            stats.overdue > 0
              ? { label: "past a promised reply", direction: "flat", inverted: true }
              : { label: "nothing late", direction: "flat" }
          }
        />
        <StatCard
          label="Resolved this week"
          value={stats.resolvedThisWeek}
          format="integer"
          icon="done"
          animate={false}
          hint={
            stats.openedThisWeek > 0
              ? `${stats.openedThisWeek} opened in the same week`
              : "nothing new came in"
          }
        />
      </StatRow>

      {stats.total > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Where they stand</h2>
            <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
              Every ticket is in exactly one of these.
            </p>
            <DonutChart slices={stats.byStatus} centreLabel="tickets" format="integer" />
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Live, by priority</h2>
            <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
              Settled tickets are left out - they are not a queue.
            </p>
            <DonutChart slices={stats.byPriority} centreLabel="live" format="integer" />
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Response</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-muted-foreground">Typical first reply</dt>
                <dd className="mt-0.5 text-xl font-semibold">
                  {describeHours(stats.medianFirstResponseHours)}
                </dd>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {/* Median, because one bad week should not rewrite the figure. */}
                  median, not average
                </p>
              </div>
              <div className="border-t pt-3">
                <dt className="text-xs text-muted-foreground">Longest anyone has waited</dt>
                <dd
                  className={`mt-0.5 text-xl font-semibold ${
                    (stats.oldestUnansweredHours ?? 0) >= 24 ? "text-tone-danger" : ""
                  }`}
                >
                  {describeHours(stats.oldestUnansweredHours)}
                </dd>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stats.oldestUnansweredHours == null
                    ? "everything live has had a reply"
                    : "still with no reply"}
                </p>
              </div>
            </dl>
          </section>
        </div>
      )}

      <TicketsView
        rows={rows}
        clients={clientOptions}
        projects={projectOptions}
        members={memberOptions}
      />
    </div>
  )
}
