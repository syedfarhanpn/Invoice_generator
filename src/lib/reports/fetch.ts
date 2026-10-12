import { currencyDecimals } from "@/lib/currencies"
import prisma from "@/lib/db"
import { summariseExpenses, type ExpenseLike } from "@/lib/expense-summary"
import { displayNameFor } from "@/lib/member-names"
import { paymentSummary } from "@/lib/money"
import { monthsInRange, type ReportRange } from "@/lib/report-range"
import { summariseSubscriptions, type SubscriptionLike } from "@/lib/subscription-summary"

import { summariseClients, type ClientRow, type ClientsReport } from "./clients"
import { summariseProjects, type ProjectRow, type ProjectsReport } from "./projects"
import { summariseSales, type SalesLead, type SalesReport } from "./sales"

/**
 * The database half of the reports.
 *
 * Every rule about what a number MEANS lives in the pure modules beside this
 * one; this file only fetches and shapes. The split is the same one used for
 * expenses and subscriptions, and for the same reason: the rules are then
 * testable without a database.
 *
 * One definition is repeated here deliberately rather than imported, and it is
 * worth naming: revenue received from a client is
 * `min(paidMinor, totalMinor)`, not `paidMinor`. An overpaid invoice has more
 * paid against it than it was ever worth, and letting that through would make
 * the Clients report disagree with the Documents figures, which derive
 * received as `invoiced - outstanding`. Two reports that disagree about the
 * same money are worse than one report.
 */

async function workspaceCurrency(userId: string): Promise<string> {
  const profile = await prisma.businessProfile.findUnique({
    where: { userId },
    select: { currency: true },
  })
  return profile?.currency || "INR"
}

/** The half-open window a range describes, as a Prisma filter. */
function createdWithin(range: { from: Date | null; to: Date }) {
  return range.from ? { gte: range.from, lt: range.to } : { lt: range.to }
}

// ---------------------------------------------------------------------------
// Sales & Leads
// ---------------------------------------------------------------------------

export async function getSalesReport(userId: string, range: ReportRange): Promise<SalesReport> {
  const select = {
    id: true,
    title: true,
    value: true,
    currency: true,
    source: true,
    createdAt: true,
    closedAt: true,
    stage: { select: { name: true, type: true, position: true } },
    client: { select: { businessName: true, fullName: true } },
    assignedTo: {
      select: {
        id: true,
        user: {
          select: { name: true, email: true, businessProfile: { select: { ownerName: true } } },
        },
      },
    },
    tasks: { where: { status: "OPEN" as const }, select: { id: true }, take: 1 },
  }

  const [currency, deals, previous] = await Promise.all([
    workspaceCurrency(userId),
    prisma.deal.findMany({
      where: {
        userId,
        archivedAt: null,
        pipeline: { kind: "LEADS" },
        createdAt: createdWithin(range),
      },
      select,
    }),
    range.previousFrom
      ? prisma.deal.findMany({
          where: {
            userId,
            archivedAt: null,
            pipeline: { kind: "LEADS" },
            createdAt: { gte: range.previousFrom, lt: range.previousTo! },
          },
          select,
        })
      : Promise.resolve([]),
  ])

  const toLead = (deal: (typeof deals)[number]): SalesLead => ({
    id: deal.id,
    title: deal.title,
    value: deal.value != null ? Number(deal.value) : null,
    currency: deal.currency,
    source: deal.source,
    createdAt: deal.createdAt,
    closedAt: deal.closedAt,
    stageName: deal.stage.name,
    stageType: deal.stage.type,
    stagePosition: deal.stage.position,
    clientName: deal.client?.businessName || deal.client?.fullName || null,
    ownerId: deal.assignedTo?.id ?? null,
    ownerName: deal.assignedTo ? displayNameFor(deal.assignedTo.user) : null,
    hasOpenTask: deal.tasks.length > 0,
  })

  return summariseSales(deals.map(toLead), previous.map(toLead), currency, range)
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/** A client's next renewal, for the panel on the Clients report. */
export type ClientRenewal = {
  id: string
  name: string
  kind: string
  clientName: string
  renewsOn: Date
  price: number | null
}

export async function getClientsReport(
  userId: string,
  range: ReportRange,
  now = new Date()
): Promise<ClientsReport & { upcomingRenewals: ClientRenewal[] }> {
  const [currency, clients] = await Promise.all([
    workspaceCurrency(userId),
    prisma.client.findMany({
      where: { userId },
      select: {
        id: true,
        fullName: true,
        businessName: true,
        createdAt: true,
        archivedAt: true,
        companyProfiles: { select: { industry: true }, take: 1 },
        projects: {
          where: { archivedAt: null },
          select: { id: true, updatedAt: true, stage: { select: { type: true } } },
        },
        documents: {
          // Issued invoices only: a draft was never billed and a void one
          // was cancelled.
          where: { type: "INVOICE", status: { notIn: ["DRAFT", "VOID"] } },
          select: {
            totalAmount: true,
            amountPaid: true,
            advanceReceived: true,
            dueDate: true,
            currency: true,
            createdAt: true,
          },
        },
      },
    }),
  ])

  const decimals = currencyDecimals(currency)
  const toMajor = (minor: number) => minor / 10 ** decimals

  const rows: ClientRow[] = clients.map((client) => {
    let receivedMinor = 0
    let outstandingMinor = 0
    let lastActivityAt: Date | null = null

    for (const invoice of client.documents) {
      if (invoice.createdAt > (lastActivityAt ?? new Date(0))) lastActivityAt = invoice.createdAt
      if (invoice.currency !== currency) continue

      const summary = paymentSummary(
        invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
        Number(invoice.amountPaid),
        invoice.dueDate,
        false,
        invoice.currency,
        Number(invoice.advanceReceived),
        now
      )
      // Capped - see the note at the top of this file.
      receivedMinor += Math.min(summary.paidMinor, summary.totalMinor)
      outstandingMinor += summary.balanceMinor
    }

    for (const project of client.projects) {
      if (project.updatedAt > (lastActivityAt ?? new Date(0))) lastActivityAt = project.updatedAt
    }

    return {
      id: client.id,
      name: client.businessName || client.fullName,
      industry: client.companyProfiles[0]?.industry ?? null,
      createdAt: client.createdAt,
      archivedAt: client.archivedAt,
      projects: client.projects.length,
      activeProjects: client.projects.filter((p) => p.stage.type === "OPEN").length,
      revenue: toMajor(receivedMinor),
      outstanding: toMajor(outstandingMinor),
      documents: client.documents.length,
      lastActivityAt,
    }
  })

  const previousAdded = range.previousFrom
    ? rows.filter((r) => r.createdAt >= range.previousFrom! && r.createdAt < range.previousTo!)
        .length
    : 0

  // Deliberately NOT scoped to the report's range: "what is coming up for my
  // clients" is a forward-looking question, and a report run over last quarter
  // would otherwise claim there is nothing to renew.
  const renewals = await prisma.subscription.findMany({
    where: {
      userId,
      archivedAt: null,
      status: "ACTIVE",
      clientId: { not: null },
      renewsOn: { gte: now },
    },
    orderBy: { renewsOn: "asc" },
    take: 8,
    select: {
      id: true,
      name: true,
      kind: true,
      renewsOn: true,
      price: true,
      client: { select: { businessName: true, fullName: true } },
    },
  })

  return {
    ...summariseClients(rows, previousAdded, currency, range),
    upcomingRenewals: renewals.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      clientName: r.client?.businessName || r.client?.fullName || "Unknown client",
      renewsOn: r.renewsOn,
      price: r.price != null ? Number(r.price) : null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function getProjectsReport(
  userId: string,
  range: ReportRange,
  now = new Date()
): Promise<ProjectsReport> {
  const [currency, projects] = await Promise.all([
    workspaceCurrency(userId),
    prisma.project.findMany({
      where: { userId, archivedAt: null },
      select: {
        id: true,
        title: true,
        category: true,
        value: true,
        currency: true,
        progress: true,
        startedAt: true,
        deadline: true,
        createdAt: true,
        updatedAt: true,
        managerId: true,
        stage: { select: { name: true, type: true, position: true } },
        client: { select: { businessName: true, fullName: true } },
        manager: {
          select: {
            user: {
              select: { name: true, email: true, businessProfile: { select: { ownerName: true } } },
            },
          },
        },
        _count: { select: { tasks: { where: { status: "OPEN" } } } },
      },
    }),
  ])

  const rows: ProjectRow[] = projects.map((project) => ({
    id: project.id,
    title: project.title,
    clientName: project.client?.businessName || project.client?.fullName || null,
    category: project.category,
    stageName: project.stage.name,
    stageType: project.stage.type,
    stagePosition: project.stage.position,
    value: project.value != null ? Number(project.value) : null,
    currency: project.currency,
    progress: project.progress,
    startedAt: project.startedAt,
    deadline: project.deadline,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    managerId: project.managerId,
    managerName: project.manager ? displayNameFor(project.manager.user) : null,
    openTasks: project._count.tasks,
  }))

  const previousStarted = range.previousFrom
    ? rows.filter((r) => {
        const at = r.startedAt ?? r.createdAt
        return at >= range.previousFrom! && at < range.previousTo!
      }).length
    : 0

  return summariseProjects(rows, previousStarted, currency, range, now)
}

// ---------------------------------------------------------------------------
// Expenses
//
// The disjoint project/overhead split is summariseExpenses' job and is not
// repeated here. What this adds is the range: the trend follows the months the
// report covers rather than a fixed last-six.
// ---------------------------------------------------------------------------

export type ExpenseReportRow = {
  id: string
  title: string
  category: string
  amount: number
  spentOn: Date
  vendor: string | null
  status: string
  scope: string
  projectTitle: string | null
  departmentName: string | null
  recurrence: string
  nextDueOn: Date | null
}

export async function getExpensesReport(userId: string, range: ReportRange, now = new Date()) {
  const [currency, expenses] = await Promise.all([
    workspaceCurrency(userId),
    prisma.expense.findMany({
      where: { userId, archivedAt: null, spentOn: createdWithin(range) },
      orderBy: { spentOn: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        amount: true,
        currency: true,
        spentOn: true,
        vendor: true,
        status: true,
        scope: true,
        recurrence: true,
        nextDueOn: true,
        project: { select: { title: true } },
        department: { select: { name: true } },
      },
    }),
  ])

  const flat: ExpenseLike[] = expenses.map((expense) => ({
    amount: Number(expense.amount),
    currency: expense.currency,
    category: expense.category,
    spentOn: expense.spentOn,
    vendor: expense.vendor,
    status: expense.status,
    scope: expense.scope,
    recurrence: expense.recurrence,
    projectTitle: expense.project?.title ?? null,
    departmentName: expense.department?.name ?? null,
  }))

  const stats = summariseExpenses(flat, currency, now)

  const months = monthsInRange(range)
  const trend = months.map((month) => ({
    label: month.label,
    value: flat
      .filter((e) => e.currency === currency && e.spentOn >= month.start && e.spentOn < month.end)
      .reduce((sum, e) => sum + e.amount, 0),
  }))

  const rows: ExpenseReportRow[] = expenses.map((expense) => ({
    id: expense.id,
    title: expense.title,
    category: expense.category,
    amount: Number(expense.amount),
    spentOn: expense.spentOn,
    vendor: expense.vendor,
    status: expense.status,
    scope: expense.scope,
    projectTitle: expense.project?.title ?? null,
    departmentName: expense.department?.name ?? null,
    recurrence: expense.recurrence,
    nextDueOn: expense.nextDueOn,
  }))

  // Averaged over the months the report covers that had any spending, not
  // over every month in the range - see the same rule in expense-summary.
  const spendingMonths = trend.filter((m) => m.value > 0).length
  const averageMonthly =
    spendingMonths > 0 ? trend.reduce((sum, m) => sum + m.value, 0) / spendingMonths : 0

  return {
    currency,
    stats,
    trend,
    averageMonthly,
    rows,
    recurring: rows.filter((r) => r.recurrence !== "ONE_OFF"),
  }
}

// ---------------------------------------------------------------------------
// Renewals
//
// Scoped by renewsOn rather than by creation: the question a renewals report
// answers is "what comes due in this period", not "what did we add".
// ---------------------------------------------------------------------------

export type RenewalReportRow = SubscriptionLike & {
  provider: string | null
  projectTitle: string | null
  lastRenewedAt: Date | null
  ownerName: string | null
}

export async function getRenewalsReport(userId: string, range: ReportRange, now = new Date()) {
  const [currency, subscriptions] = await Promise.all([
    workspaceCurrency(userId),
    prisma.subscription.findMany({
      where: { userId, archivedAt: null, renewsOn: createdWithin(range) },
      orderBy: { renewsOn: "asc" },
      select: {
        id: true,
        kind: true,
        name: true,
        status: true,
        renewsOn: true,
        cycle: true,
        cost: true,
        price: true,
        currency: true,
        autoRenew: true,
        provider: true,
        lastRenewedAt: true,
        clientId: true,
        client: { select: { businessName: true, fullName: true } },
        project: { select: { title: true } },
        owner: {
          select: {
            user: {
              select: { name: true, email: true, businessProfile: { select: { ownerName: true } } },
            },
          },
        },
      },
    }),
  ])

  const rows: RenewalReportRow[] = subscriptions.map((s) => ({
    id: s.id,
    kind: s.kind,
    name: s.name,
    status: s.status,
    renewsOn: s.renewsOn,
    cycle: s.cycle,
    cost: s.cost != null ? Number(s.cost) : null,
    price: s.price != null ? Number(s.price) : null,
    currency: s.currency,
    autoRenew: s.autoRenew,
    clientId: s.clientId,
    clientName: s.client?.businessName || s.client?.fullName || null,
    provider: s.provider,
    projectTitle: s.project?.title ?? null,
    lastRenewedAt: s.lastRenewedAt,
    ownerName: s.owner ? displayNameFor(s.owner.user) : null,
  }))

  const stats = summariseSubscriptions(rows, currency, now)

  const months = monthsInRange(range)
  const trend = months.map((month) => ({
    label: month.label,
    value: rows.filter((r) => r.renewsOn >= month.start && r.renewsOn < month.end).length,
  }))

  return {
    currency,
    stats,
    trend,
    rows,
    // Renewed inside the range - evidence that the queue is being worked,
    // which a list of what is still due cannot show.
    renewed: rows.filter(
      (r) =>
        r.lastRenewedAt != null &&
        (!range.from || r.lastRenewedAt >= range.from) &&
        r.lastRenewedAt < range.to
    ).length,
  }
}
