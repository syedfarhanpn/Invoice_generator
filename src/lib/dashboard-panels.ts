import { currencyDecimals } from "@/lib/currencies"
import prisma from "@/lib/db"
import { INFRASTRUCTURE_KINDS, KIND_LABEL, daysUntil, describeRenewal } from "@/lib/renewals"

/**
 * The lower half of the Overview, added to match the reference dashboard.
 *
 * Kept beside getDashboardData() rather than inside it: that function is the
 * four headline figures and the revenue series, and every page-level figure in
 * the product is derived from it. These are the panels - renewals, tickets,
 * the activity feed - and they are queried separately so a change to one
 * cannot disturb the other.
 *
 * Nothing here invents a category. Where the reference shows a label this
 * product has no row for ("On Hold", "Lead"), the honest equivalent is used
 * and named for what it actually measures.
 */

export type ExpenseMonth = { month: string; label: string; expenses: number }

export type DistributionSlice = { label: string; value: number }

export type RenewalItem = {
  id: string
  name: string
  detail: string
  /** "Due in 10 days", "3 days ago". */
  dueLabel: string
  dateLabel: string
  /** Negative once it has passed. Drives the badge colour. */
  days: number
}

export type TaskItem = {
  id: string
  title: string
  timeLabel: string
  /** Where the task hangs - a client, a project, or nothing. */
  context: string
  done: boolean
}

export type TicketItem = {
  id: string
  ref: string
  subject: string
  detail: string
  status: string
  statusLabel: string
  ago: string
  /** Drives the leading dot. */
  priority: string
}

export type ActivityItem = {
  id: string
  title: string
  detail: string
  ago: string
  kind: "payment" | "document" | "project" | "client"
}

export type DashboardPanels = {
  monthlyExpenses: ExpenseMonth[]
  clientDistribution: DistributionSlice[]
  amcRenewals: RenewalItem[]
  infrastructureRenewals: RenewalItem[]
  todaysTasks: TaskItem[]
  recentTickets: TicketItem[]
  recentActivity: ActivityItem[]
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })
const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  year: "numeric",
})
/** Operator-local, because a task at 10am means their morning. */
const TIME_LABEL = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
})

function monthStart(now: Date, back: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

/** "2 hours ago", "4 days ago" - the resolution the reference shows. */
function ago(from: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  const months = Math.round(days / 30)
  return `${months} month${months === 1 ? "" : "s"} ago`
}

const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_ON_CLIENT: "Waiting",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

export async function getDashboardPanels(
  userId: string,
  now = new Date()
): Promise<DashboardPanels> {
  const sixMonthsAgo = monthStart(now, 5)
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
  const endOfToday = new Date(startOfToday.getTime() + 86_400_000)

  const [profile, expenses, clients, subscriptions, tasks, tickets, payments, documents, newClients, newProjects] =
    await Promise.all([
      prisma.businessProfile.findUnique({ where: { userId }, select: { currency: true } }),

      prisma.expense.findMany({
        where: { userId, archivedAt: null, spentOn: { gte: sixMonthsAgo } },
        select: { amount: true, currency: true, spentOn: true },
      }),

      // Enough of each client to tell live work from finished work.
      prisma.client.findMany({
        where: { userId, archivedAt: null },
        select: {
          id: true,
          projects: {
            where: { archivedAt: null },
            select: { stage: { select: { type: true } } },
          },
          documents: {
            where: { type: "INVOICE", status: { notIn: ["DRAFT", "VOID"] } },
            select: { totalAmount: true, amountPaid: true, advanceReceived: true, currency: true },
          },
        },
      }),

      prisma.subscription.findMany({
        where: { userId, archivedAt: null, status: "ACTIVE" },
        orderBy: { renewsOn: "asc" },
        select: {
          id: true,
          kind: true,
          name: true,
          renewsOn: true,
          client: { select: { businessName: true, fullName: true } },
        },
      }),

      prisma.task.findMany({
        where: { userId, dueAt: { gte: startOfToday, lt: endOfToday } },
        orderBy: { dueAt: "asc" },
        take: 6,
        select: {
          id: true,
          title: true,
          dueAt: true,
          status: true,
          client: { select: { businessName: true, fullName: true } },
          project: { select: { title: true } },
          deal: { select: { title: true } },
        },
      }),

      prisma.ticket.findMany({
        where: { userId, archivedAt: null, status: { notIn: ["CLOSED"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          priority: true,
          createdAt: true,
          client: { select: { businessName: true, fullName: true } },
          project: { select: { title: true } },
        },
      }),

      // The four sources the activity feed is assembled from.
      prisma.payment.findMany({
        where: { userId },
        orderBy: { paidOn: "desc" },
        take: 5,
        select: {
          id: true,
          amount: true,
          paidOn: true,
          document: {
            select: {
              refNumber: true,
              client: { select: { businessName: true, fullName: true } },
            },
          },
        },
      }),
      prisma.document.findMany({
        where: { userId, status: { notIn: ["DRAFT", "VOID"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          refNumber: true,
          title: true,
          type: true,
          createdAt: true,
          client: { select: { businessName: true, fullName: true } },
        },
      }),
      prisma.client.findMany({
        where: { userId, archivedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, businessName: true, fullName: true, createdAt: true },
      }),
      prisma.project.findMany({
        where: { userId, archivedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          client: { select: { businessName: true, fullName: true } },
        },
      }),
    ])

  const currency = profile?.currency || "INR"
  const decimals = currencyDecimals(currency)
  const factor = 10 ** decimals

  // --- expenses by month, matching the revenue series window ---------------
  const byMonth = new Map<string, number>()
  for (const expense of expenses) {
    if (expense.currency !== currency) continue
    const key = `${expense.spentOn.getUTCFullYear()}-${String(expense.spentOn.getUTCMonth() + 1).padStart(2, "0")}`
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(expense.amount))
  }
  const monthlyExpenses: ExpenseMonth[] = Array.from({ length: 6 }, (_, i) => {
    const date = monthStart(now, 5 - i)
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
    return { month: key, label: MONTH_LABEL.format(date), expenses: byMonth.get(key) ?? 0 }
  })

  // --- client distribution -------------------------------------------------
  // The reference labels these Ongoing / Completed / On Hold / Lead. This
  // product has no "on hold" stage and no client-level lead flag, so each
  // slice is named for what it actually counts rather than borrowing a word
  // the data cannot support.
  let ongoing = 0
  let completed = 0
  let owing = 0
  let dormant = 0

  for (const client of clients) {
    const hasOpen = client.projects.some((p) => p.stage.type === "OPEN")
    let balanceMinor = 0
    for (const invoice of client.documents) {
      if (invoice.currency !== currency) continue
      const total = Math.round((Number(invoice.totalAmount) || 0) * factor)
      const paid =
        Math.max(0, Math.round((Number(invoice.amountPaid) || 0) * factor)) +
        Math.max(0, Math.round((Number(invoice.advanceReceived) || 0) * factor))
      balanceMinor += Math.max(0, total - paid)
    }

    if (hasOpen) ongoing += 1
    else if (balanceMinor > 0) owing += 1
    else if (client.projects.length > 0) completed += 1
    else dormant += 1
  }

  const clientDistribution: DistributionSlice[] = [
    { label: "Ongoing work", value: ongoing },
    { label: "Delivered", value: completed },
    { label: "Awaiting payment", value: owing },
    { label: "No projects yet", value: dormant },
  ].filter((slice) => slice.value > 0)

  // --- renewals, split the way the reference tabs them ---------------------
  const toRenewal = (s: (typeof subscriptions)[number]): RenewalItem => {
    const days = daysUntil(s.renewsOn, now)
    return {
      id: s.id,
      name: s.client?.businessName || s.client?.fullName || s.name,
      detail: s.client ? `${s.name} · ${KIND_LABEL[s.kind]}` : KIND_LABEL[s.kind],
      dueLabel: describeRenewal(days),
      dateLabel: DAY_LABEL.format(s.renewsOn),
      days,
    }
  }

  const infrastructureKinds = new Set<string>(INFRASTRUCTURE_KINDS)
  const amcRenewals = subscriptions
    .filter((s) => !infrastructureKinds.has(s.kind))
    .slice(0, 5)
    .map(toRenewal)
  const infrastructureRenewals = subscriptions
    .filter((s) => infrastructureKinds.has(s.kind))
    .slice(0, 5)
    .map(toRenewal)

  // --- today ---------------------------------------------------------------
  const todaysTasks: TaskItem[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    timeLabel: task.dueAt ? TIME_LABEL.format(task.dueAt) : "",
    context:
      task.client?.businessName ||
      task.client?.fullName ||
      task.project?.title ||
      task.deal?.title ||
      "Internal",
    done: task.status === "DONE",
  }))

  const recentTickets: TicketItem[] = tickets.map((ticket) => ({
    id: ticket.id,
    ref: `TKT-${String(ticket.number).padStart(3, "0")}`,
    subject: ticket.subject,
    detail:
      ticket.client?.businessName ||
      ticket.client?.fullName ||
      ticket.project?.title ||
      "No client",
    status: ticket.status,
    statusLabel: TICKET_STATUS_LABEL[ticket.status] ?? ticket.status,
    ago: ago(ticket.createdAt, now),
    priority: ticket.priority,
  }))

  // --- activity ------------------------------------------------------------
  // Assembled from the rows that actually record something happening, then
  // merged by time. There is no single activity table that spans money, work
  // and clients, so this is the honest way to show one feed.
  const feed: (ActivityItem & { at: Date })[] = [
    ...payments.map((p) => ({
      id: `payment-${p.id}`,
      kind: "payment" as const,
      title: p.document?.refNumber
        ? `${p.document.refNumber} marked as paid`
        : "Payment received",
      detail: p.document?.client?.businessName || p.document?.client?.fullName || "No client",
      ago: ago(p.paidOn, now),
      at: p.paidOn,
    })),
    ...documents.map((d) => ({
      id: `document-${d.id}`,
      kind: "document" as const,
      title: `${d.refNumber || d.title || "Document"} issued`,
      detail: d.client?.businessName || d.client?.fullName || "No client",
      ago: ago(d.createdAt, now),
      at: d.createdAt,
    })),
    ...newProjects.map((p) => ({
      id: `project-${p.id}`,
      kind: "project" as const,
      title: "New project created",
      detail: p.client
        ? `${p.title} · ${p.client.businessName || p.client.fullName}`
        : p.title,
      ago: ago(p.createdAt, now),
      at: p.createdAt,
    })),
    ...newClients.map((c) => ({
      id: `client-${c.id}`,
      kind: "client" as const,
      title: "New client onboarded",
      detail: c.businessName || c.fullName,
      ago: ago(c.createdAt, now),
      at: c.createdAt,
    })),
  ]

  const recentActivity: ActivityItem[] = feed
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 5)
    // The sort key is not part of the row the panel renders.
    .map((item) => ({ id: item.id, title: item.title, detail: item.detail, ago: item.ago, kind: item.kind }))

  return {
    monthlyExpenses,
    clientDistribution,
    amcRenewals,
    infrastructureRenewals,
    todaysTasks,
    recentTickets,
    recentActivity,
  }
}
