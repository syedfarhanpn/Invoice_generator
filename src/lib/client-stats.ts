import { currencyDecimals } from "@/lib/currencies"
import prisma from "@/lib/db"
import { paymentSummary } from "@/lib/money"

/**
 * The figures behind the Clients screen.
 *
 * Revenue per client is money received, derived through the same
 * paymentSummary() the invoice badges use, so a client's total here and the
 * status on their invoices cannot tell different stories.
 *
 * The reference also shows recurring AMC revenue. There is no renewals model
 * yet, so that card is absent rather than approximated from something else.
 */

export type ClientBreakdown = { label: string; value: number }
export type ClientRevenue = { id: string; name: string; revenue: number; projects: number }
export type GrowthPoint = { label: string; total: number }

export type ClientStats = {
  currency: string
  total: number
  newThisMonth: number
  /** Clients with an open project or an unsettled invoice - live relationships. */
  withOpenWork: number
  projectCount: number
  receivedTotal: number
  outstandingTotal: number
  growth: GrowthPoint[]
  byIndustry: ClientBreakdown[]
  topByRevenue: ClientRevenue[]
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })

function monthStart(now: Date, back: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

export async function getClientStats(userId: string, now = new Date()): Promise<ClientStats> {
  const thisMonth = monthStart(now, 0)

  const [profile, clients] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId }, select: { currency: true } }),
    prisma.client.findMany({
      where: { userId, archivedAt: null },
      select: {
        id: true,
        fullName: true,
        businessName: true,
        createdAt: true,
        companyProfiles: { select: { industry: true }, take: 1 },
        projects: {
          where: { archivedAt: null },
          select: { id: true, stage: { select: { type: true } } },
        },
        documents: {
          where: { type: "INVOICE", status: { notIn: ["DRAFT", "VOID"] } },
          select: {
            totalAmount: true,
            amountPaid: true,
            advanceReceived: true,
            dueDate: true,
            currency: true,
          },
        },
      },
    }),
  ])

  const currency = profile?.currency || "INR"
  const decimals = currencyDecimals(currency)
  const toMajor = (minor: number) => minor / 10 ** decimals

  let receivedMinor = 0
  let outstandingMinor = 0
  let projectCount = 0
  let withOpenWork = 0

  const industry = new Map<string, number>()
  const revenues: ClientRevenue[] = []

  for (const client of clients) {
    const label = client.companyProfiles[0]?.industry?.trim() || "Not recorded"
    industry.set(label, (industry.get(label) ?? 0) + 1)

    projectCount += client.projects.length
    const hasOpenProject = client.projects.some((p) => p.stage.type === "OPEN")

    let clientReceived = 0
    let clientOutstanding = 0
    for (const invoice of client.documents) {
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
      clientReceived += summary.paidMinor
      clientOutstanding += summary.balanceMinor
    }

    receivedMinor += clientReceived
    outstandingMinor += clientOutstanding
    if (hasOpenProject || clientOutstanding > 0) withOpenWork += 1

    revenues.push({
      id: client.id,
      name: client.businessName || client.fullName,
      revenue: toMajor(clientReceived),
      projects: client.projects.length,
    })
  }

  // Cumulative, not per-month: the question "how many clients do we have" has
  // a running answer, and a bar chart of joins would hide that the base grows.
  const growth: GrowthPoint[] = Array.from({ length: 6 }, (_, i) => {
    const edge = monthStart(now, 5 - i - 1 + 1)
    const nextMonth = new Date(Date.UTC(edge.getUTCFullYear(), edge.getUTCMonth() + 1, 1))
    return {
      label: MONTH_LABEL.format(edge),
      total: clients.filter((c) => c.createdAt < nextMonth).length,
    }
  })

  return {
    currency,
    total: clients.length,
    newThisMonth: clients.filter((c) => c.createdAt >= thisMonth).length,
    withOpenWork,
    projectCount,
    receivedTotal: toMajor(receivedMinor),
    outstandingTotal: toMajor(outstandingMinor),
    growth,
    byIndustry: [...industry.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    topByRevenue: revenues
      .filter((r) => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6),
  }
}
