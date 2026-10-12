import { currencyDecimals } from "@/lib/currencies"
import prisma from "@/lib/db"
import { paymentSummary } from "@/lib/money"

/**
 * Everything the Overview screen shows, in one batched read.
 *
 * Each figure is derived from the rows that define it rather than counted a
 * second way, so the headline and the list under it can never disagree. The
 * reference dashboard also carries renewals and a ticket inbox; neither has a
 * data model yet, and inventing figures for them is exactly what the brief
 * forbids, so they are absent rather than empty-but-plausible.
 */

export type MonthPoint = { month: string; label: string; revenue: number }
export type Breakdown = { label: string; value: number; share: number }

export type RecentProject = {
  id: string
  title: string
  clientName: string | null
  stageName: string
  stageType: "OPEN" | "WON" | "LOST"
  deadline: Date | null
  /** What kind of work it is. Free text, so it can be absent. */
  category: string | null
  /** 0-100 as the operator judges it, or null when nobody has said. */
  progress: number | null
}

export type AgendaTask = {
  id: string
  title: string
  dueAt: Date | null
  priority: "LOW" | "NORMAL" | "HIGH"
  done: boolean
}

export type DashboardData = {
  currency: string
  revenue: { current: number; previous: number }
  outstanding: { amount: number; invoiceCount: number; overdueAmount: number; overdueCount: number }
  clients: { active: number; newThisMonth: number }
  projects: { active: number; newThisMonth: number }
  monthlyRevenue: MonthPoint[]
  projectsByStage: Breakdown[]
  recentProjects: RecentProject[]
  agenda: AgendaTask[]
  /** True when there is nothing at all yet, so the page can say so once. */
  isEmpty: boolean
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })

/** First instant of a month, N months back from `now`, in UTC. */
function monthStart(now: Date, back: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

export async function getDashboardData(userId: string, now = new Date()): Promise<DashboardData> {
  const thisMonth = monthStart(now, 0)
  const lastMonth = monthStart(now, 1)
  const sixMonthsAgo = monthStart(now, 5)

  const [profile, payments, invoices, clientCount, newClients, projects, tasks] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId }, select: { currency: true } }),

    // Revenue is money that actually arrived, so it comes from payments rather
    // than from invoice totals. An invoice raised is not revenue.
    prisma.payment.findMany({
      where: { userId, paidOn: { gte: sixMonthsAgo } },
      select: { amount: true, paidOn: true },
    }),

    prisma.document.findMany({
      where: { userId, type: "INVOICE", status: { notIn: ["DRAFT", "VOID"] } },
      select: {
        totalAmount: true,
        amountPaid: true,
        advanceReceived: true,
        dueDate: true,
        currency: true,
      },
    }),

    prisma.client.count({ where: { userId, archivedAt: null } }),
    prisma.client.count({ where: { userId, archivedAt: null, createdAt: { gte: thisMonth } } }),

    prisma.project.findMany({
      where: { userId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        deadline: true,
        createdAt: true,
        category: true,
        progress: true,
        client: { select: { businessName: true, fullName: true } },
        stage: { select: { name: true, type: true, position: true } },
      },
    }),

    prisma.task.findMany({
      where: { userId, status: { in: ["OPEN", "DONE"] }, dueAt: { not: null } },
      orderBy: { dueAt: "asc" },
      take: 40,
      select: { id: true, title: true, dueAt: true, priority: true, status: true },
    }),
  ])

  const currency = profile?.currency || "INR"
  const decimals = currencyDecimals(currency)

  // --- revenue -------------------------------------------------------------
  let currentRevenue = 0
  let previousRevenue = 0
  const byMonth = new Map<string, number>()

  for (const payment of payments) {
    const amount = Number(payment.amount)
    const key = `${payment.paidOn.getUTCFullYear()}-${String(payment.paidOn.getUTCMonth() + 1).padStart(2, "0")}`
    byMonth.set(key, (byMonth.get(key) ?? 0) + amount)
    if (payment.paidOn >= thisMonth) currentRevenue += amount
    else if (payment.paidOn >= lastMonth) previousRevenue += amount
  }

  // Every month in the window, including the ones with nothing in them - a
  // gap would silently shorten the axis and make a quiet month invisible.
  const monthlyRevenue: MonthPoint[] = Array.from({ length: 6 }, (_, i) => {
    const date = monthStart(now, 5 - i)
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
    return { month: key, label: MONTH_LABEL.format(date), revenue: byMonth.get(key) ?? 0 }
  })

  // --- outstanding ---------------------------------------------------------
  // Derived through paymentSummary, the same helper the per-row badge uses, so
  // the card and the invoice list can never tell different stories.
  let outstandingMinor = 0
  let overdueMinor = 0
  let outstandingCount = 0
  let overdueCount = 0

  for (const invoice of invoices) {
    if (invoice.currency !== currency) continue // totals only mean anything within one currency
    const summary = paymentSummary(
      invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
      Number(invoice.amountPaid),
      invoice.dueDate,
      false,
      invoice.currency,
      Number(invoice.advanceReceived),
      now
    )
    if (summary.balanceMinor <= 0) continue
    outstandingMinor += summary.balanceMinor
    outstandingCount += 1
    if (summary.isOverdue) {
      overdueMinor += summary.balanceMinor
      overdueCount += 1
    }
  }

  const toMajor = (minor: number) => minor / 10 ** decimals

  // --- projects ------------------------------------------------------------
  const activeProjects = projects.filter((p) => p.stage.type === "OPEN")
  const stageCounts = new Map<string, { count: number; position: number }>()
  for (const project of projects) {
    const entry = stageCounts.get(project.stage.name)
    if (entry) entry.count += 1
    else stageCounts.set(project.stage.name, { count: 1, position: project.stage.position })
  }

  const projectsByStage: Breakdown[] = [...stageCounts.entries()]
    .sort((a, b) => a[1].position - b[1].position)
    .map(([label, { count }]) => ({
      label,
      value: count,
      share: projects.length ? count / projects.length : 0,
    }))

  // --- agenda --------------------------------------------------------------
  // Everything due up to the end of today, plus whatever is next. A list that
  // stopped at "today" would be empty on a quiet morning and say nothing.
  const endOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  )
  const dueSoon = tasks.filter((t) => t.dueAt && t.dueAt < endOfToday)
  const upcoming = tasks.filter((t) => t.dueAt && t.dueAt >= endOfToday)
  const agenda: AgendaTask[] = [...dueSoon, ...upcoming].slice(0, 6).map((task) => ({
    id: task.id,
    title: task.title,
    dueAt: task.dueAt,
    priority: task.priority,
    done: task.status === "DONE",
  }))

  return {
    currency,
    revenue: { current: currentRevenue, previous: previousRevenue },
    outstanding: {
      amount: toMajor(outstandingMinor),
      invoiceCount: outstandingCount,
      overdueAmount: toMajor(overdueMinor),
      overdueCount,
    },
    clients: { active: clientCount, newThisMonth: newClients },
    projects: {
      active: activeProjects.length,
      newThisMonth: projects.filter((p) => p.createdAt >= thisMonth).length,
    },
    monthlyRevenue,
    projectsByStage,
    recentProjects: projects.slice(0, 5).map((project) => ({
      id: project.id,
      title: project.title,
      clientName: project.client?.businessName || project.client?.fullName || null,
      stageName: project.stage.name,
      stageType: project.stage.type,
      deadline: project.deadline,
      category: project.category,
      progress: project.progress,
    })),
    agenda,
    isEmpty:
      clientCount === 0 && invoices.length === 0 && projects.length === 0 && payments.length === 0,
  }
}
