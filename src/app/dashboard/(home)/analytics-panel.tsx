import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { InvoiceAnalytics } from "@/components/app/invoice-analytics"
import {
  buildSeries,
  earliestRangeStart,
  RANGES,
  type AnalyticsInvoice,
  type RangeKey,
  type RangeSeries,
} from "@/lib/analytics"

/**
 * Data for the invoice activity chart.
 *
 * One query covers both windows - it reaches back to whichever of the two
 * starts earlier - and both series are built here and handed over together, so
 * the range switch is instant rather than a round trip. `now` is read once and
 * shared, so the two windows can never be computed against different instants.
 *
 * Its own async component behind a <Suspense> boundary, like the other two
 * dashboard sections, so a slow query holds up nothing else on the page.
 */
export default async function AnalyticsPanel() {
  const user = await getCurrentUser()
  const now = new Date()
  const since = earliestRangeStart(now)

  const [businessProfile, rows] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { userId: user.id },
      select: { currency: true },
    }),
    prisma.document.findMany({
      where: {
        userId: user.id,
        type: "INVOICE",
        // Drafts were never billed; voids were cancelled after the fact.
        status: { notIn: ["DRAFT", "VOID"] },
        // Undated invoices fall back to their creation day, so the window has
        // to be matched against whichever date the bucket will actually use.
        OR: [{ issueDate: { gte: since } }, { issueDate: null, createdAt: { gte: since } }],
      },
      select: {
        issueDate: true,
        createdAt: true,
        totalAmount: true,
        amountPaid: true,
        advanceReceived: true,
        dueDate: true,
        currency: true,
      },
    }),
  ])

  const currency = businessProfile?.currency || "USD"

  // Totals only make sense within one currency, so foreign invoices are left
  // out and called out instead of being silently added together - the same rule
  // the stat cards above use.
  const inCurrency = rows.filter((row) => row.currency === currency)
  const invoices: AnalyticsInvoice[] = inCurrency.map((row) => ({
    issueDate: row.issueDate,
    createdAt: row.createdAt,
    totalAmount: row.totalAmount != null ? Number(row.totalAmount) : null,
    amountPaid: Number(row.amountPaid),
    advanceReceived: Number(row.advanceReceived),
    dueDate: row.dueDate,
    currency: row.currency,
  }))

  const series = Object.fromEntries(
    RANGES.map((r) => [r.key, buildSeries(invoices, currency, r.key, now)])
  ) as Record<RangeKey, RangeSeries>

  return (
    <InvoiceAnalytics
      series={series}
      currency={currency}
      hasMixedCurrencies={rows.length !== inCurrency.length}
    />
  )
}
