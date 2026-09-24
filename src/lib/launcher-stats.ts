import prisma from "@/lib/db"
import { paymentSummary } from "@/lib/money"
import { currencyDecimals } from "@/lib/currencies"

/**
 * One live figure per app tile on the launcher.
 *
 * The launcher is the first screen after login, so this is the query that
 * gates every session's first paint. It is deliberately five aggregates and
 * one narrow row read rather than a page's worth of data: a tile earns its
 * figure by being glanceable, not by being a dashboard in miniature.
 *
 * Counts run as COUNT in Postgres. Only the invoice figure reads rows, and
 * only the four columns paymentSummary needs - the same derivation the
 * invoice stats cards use, so the two can never disagree.
 */

/** Tasks are appointments in the operator's day, which is IST. See src/lib/dates.ts. */
const FOLLOW_UP_ZONE = "Asia/Kolkata"

/** The instant the current IST day ends - everything before it is due or late. */
function endOfTodayInZone(now: Date): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: FOLLOW_UP_ZONE }).format(now)
  // IST is a fixed +05:30 with no DST, so the offset can be written literally.
  return new Date(Date.parse(`${day}T00:00:00+05:30`) + 86_400_000)
}

export type LauncherStats = {
  businessName: string | null
  currency: string
  /** Outstanding across issued invoices, in major units of `currency`. */
  outstanding: number
  overdueCount: number
  openDeals: number
  /** Open deals with no open task against them - the CRM's one nudge. */
  dealsNeedingAction: number
  clients: number
  dueToday: number
  activeOperators: number
}

export async function getLauncherStats(
  userId: string,
  includeOperators: boolean
): Promise<LauncherStats> {
  const dueBefore = endOfTodayInZone(new Date())

  const [profile, invoices, openDeals, dealsWithTask, clients, dueToday, activeOperators] =
    await Promise.all([
      prisma.businessProfile.findUnique({
        where: { userId },
        select: { businessName: true, currency: true },
      }),
      prisma.document.findMany({
        where: {
          userId,
          type: "INVOICE",
          // Drafts were never billed; voids were cancelled after the fact.
          status: { notIn: ["DRAFT", "VOID"] },
        },
        select: {
          totalAmount: true,
          amountPaid: true,
          advanceReceived: true,
          dueDate: true,
          currency: true,
        },
      }),
      prisma.deal.count({
        where: { userId, archivedAt: null, stage: { type: "OPEN" } },
      }),
      // Distinct deals that already have something scheduled. Subtracting
      // gives the ones that have gone quiet, which is the figure worth showing.
      prisma.task
        .findMany({
          where: {
            userId,
            status: "OPEN",
            deal: { archivedAt: null, stage: { type: "OPEN" } },
          },
          select: { dealId: true },
          distinct: ["dealId"],
        })
        .then((rows) => rows.filter((r) => r.dealId).length),
      prisma.client.count({ where: { userId } }),
      prisma.task.count({
        where: { userId, status: "OPEN", dueAt: { not: null, lt: dueBefore } },
      }),
      includeOperators
        ? prisma.user.count({ where: { status: "ACTIVE" } })
        : Promise.resolve(0),
    ])

  const currency = profile?.currency || "USD"
  const decimals = currencyDecimals(currency)

  // Totals only mean anything inside one currency, so foreign invoices sit
  // this out rather than being silently added together.
  let outstandingMinor = 0
  let overdueCount = 0
  for (const invoice of invoices) {
    if (invoice.currency !== currency) continue
    const summary = paymentSummary(
      invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
      Number(invoice.amountPaid),
      invoice.dueDate,
      false,
      invoice.currency,
      Number(invoice.advanceReceived)
    )
    outstandingMinor += summary.balanceMinor
    if (summary.isOverdue) overdueCount += 1
  }

  return {
    businessName: profile?.businessName ?? null,
    currency,
    outstanding: outstandingMinor / 10 ** decimals,
    overdueCount,
    openDeals,
    dealsNeedingAction: Math.max(0, openDeals - dealsWithTask),
    clients,
    dueToday,
    activeOperators,
  }
}
