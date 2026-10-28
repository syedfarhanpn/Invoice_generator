import Link from "next/link"
import { BarChart3, PieChart, Plus } from "lucide-react"

import { AreaChart } from "@/components/app/area-chart"
import { DonutChart } from "@/components/app/donut-chart"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { buttonVariants } from "@/components/ui/button"
import { requirePermission } from "@/lib/access"
import { formatTableDay } from "@/lib/dates"
import prisma from "@/lib/db"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import {
  DEFAULT_FILTER,
  matchesFilter,
  parseFilter,
  type FilterableDoc,
} from "@/lib/document-filters"
import { documentKind } from "@/lib/document-kinds"
import { summariseDocuments } from "@/lib/document-stats"
import {
  invoicedBetween,
  invoicedByMonth,
  invoicedByPaymentStatus,
  monthStart,
  weekStart,
  yearStart,
  type InvoicedDoc,
} from "@/lib/document-trend"
import { formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { formatMoney, paymentSummary } from "@/lib/money"

import { DocumentsTable } from "./documents-table"

export const metadata = { title: "Documents" }

/**
 * Documents, laid out as the reference dashboard.
 *
 * The cards up top answer "how much have we billed, and over what period",
 * which is a different question from the one the table answers. Both come out
 * of the same rows, so the headline and the list can never disagree.
 *
 * Every money figure counts ISSUED INVOICES only - a draft was never billed, a
 * void one was cancelled, and a quotation is a price someone asked for rather
 * than money owed. The rules live in lib/document-trend.ts, pure and tested.
 */
export default async function DocumentsHistoryPage(props: {
  searchParams: Promise<{ filter?: string }>
}) {
  // Server-side, before any query runs. Hiding the nav entry is not
  // access control; this is.
  await requirePermission("documents", "read")

  const [searchParams, { workspaceId }] = await Promise.all([
    props.searchParams,
    getWorkspaceIdentity(),
  ])
  const activeFilter = parseFilter(searchParams.filter)
  const now = new Date()

  // Columns only, never the row. Document.content holds the line items and
  // contract clauses - on this workspace that is over half the table's bytes,
  // and the list renders none of it. Measured: 124ms for the whole row against
  // 40ms for these columns.
  const [documents, profile] = await Promise.all([
    prisma.document.findMany({
      where: { userId: workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        refNumber: true,
        title: true,
        type: true,
        status: true,
        totalAmount: true,
        amountPaid: true,
        advanceReceived: true,
        issueDate: true,
        dueDate: true,
        currency: true,
        clientId: true,
        createdAt: true,
        client: { select: { businessName: true, fullName: true } },
      },
    }),
    prisma.businessProfile.findUnique({
      where: { userId: workspaceId },
      select: { currency: true },
    }),
  ])

  const currency = profile?.currency || "INR"

  // Prisma hands back Decimal; the filters work in plain numbers. Pair each
  // row with its numeric view once so counts and filtering share the work.
  const rows = documents.map((doc) => ({
    doc,
    filterable: {
      type: doc.type,
      status: doc.status,
      totalAmount: doc.totalAmount != null ? Number(doc.totalAmount) : null,
      amountPaid: Number(doc.amountPaid),
      dueDate: doc.dueDate,
      currency: doc.currency,
      advanceReceived: Number(doc.advanceReceived),
    } satisfies FilterableDoc,
  }))

  const visible = rows.filter((r) => matchesFilter(r.filterable, activeFilter))

  // Deliberately over every document, not over the filtered view: these are
  // the state of the book, and a figure that moved every time you changed a
  // filter would be a different question each time you read it.
  const stats = summariseDocuments(
    rows.map((r) => r.filterable),
    currency
  )

  // --- the periods --------------------------------------------------------
  const billable: InvoicedDoc[] = documents.map((doc) => ({
    type: doc.type,
    status: doc.status,
    totalAmount: doc.totalAmount != null ? Number(doc.totalAmount) : null,
    amountPaid: Number(doc.amountPaid),
    advanceReceived: Number(doc.advanceReceived),
    dueDate: doc.dueDate,
    issueDate: doc.issueDate,
    createdAt: doc.createdAt,
    currency: doc.currency,
    clientId: doc.clientId,
  }))

  const DAY = 86_400_000
  const thisMonth = monthStart(now)
  const lastMonth = monthStart(now, 1)
  const thisWeek = weekStart(now)
  const lastWeek = new Date(thisWeek.getTime() - 7 * DAY)
  const thisYear = yearStart(now)
  const lastYear = yearStart(now, 1)
  const nextYear = yearStart(now, -1)

  const month = invoicedBetween(billable, thisMonth, now, currency)
  const monthBefore = invoicedBetween(billable, lastMonth, thisMonth, currency)
  const week = invoicedBetween(billable, thisWeek, now, currency)
  const weekBefore = invoicedBetween(billable, lastWeek, thisWeek, currency)
  const year = invoicedBetween(billable, thisYear, now, currency)
  const yearBefore = invoicedBetween(billable, lastYear, thisYear, currency)

  const monthChange = percentChange(month.amount, monthBefore.amount)
  const weekChange = percentChange(week.amount, weekBefore.amount)
  const yearChange = percentChange(year.amount, yearBefore.amount)
  // A floor of five clients: two where there was one is "+100%", which is
  // true and tells the reader only that the denominator was small.
  const clientChange = percentChange(month.clients, monthBefore.clients, 5)

  const trend = invoicedByMonth(billable, now.getUTCFullYear(), currency)
  const byStatus = invoicedByPaymentStatus(billable, thisYear, nextYear, currency, now)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage your invoices, quotations, proformas and contracts.
          </p>
        </div>
        <Link href="/dashboard/documents/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="mr-1.5 size-4" /> Create Document
        </Link>
      </header>

      <StatRow>
        <StatCard
          variant="overview"
          href="/dashboard/documents?filter=invoiced"
          label="Total Invoiced"
          value={stats.invoiced}
          format="compactCurrency"
          currency={currency}
          icon="receipt"
          delta={
            stats.outstanding > 0
              ? {
                  label: `${formatCompactAmount(stats.outstanding, currency)} outstanding`,
                  direction: "flat",
                  inverted: true,
                  caption: "all-time invoice value",
                }
              : { label: "all settled", direction: "flat", caption: "all-time invoice value" }
          }
        />
        <StatCard
          variant="overview"
          href="/dashboard/documents?filter=invoiced"
          label="Invoiced This Month"
          value={month.amount}
          format="compactCurrency"
          currency={currency}
          icon="money"
          delta={
            monthChange == null
              ? { label: `${month.count} raised`, direction: "flat", caption: "so far" }
              : {
                  label: formatDelta(monthChange),
                  direction: monthChange >= 0 ? "up" : "down",
                  caption: "vs last month",
                }
          }
        />
        <StatCard
          variant="overview"
          href="/dashboard/clients"
          label="Clients Invoiced This Month"
          value={month.clients}
          format="integer"
          icon="clients"
          delta={
            clientChange == null
              ? {
                  label: `${monthBefore.clients} last month`,
                  direction: "flat",
                }
              : {
                  label: formatDelta(clientChange),
                  direction: clientChange >= 0 ? "up" : "down",
                  caption: "vs last month",
                }
          }
        />
        <StatCard
          variant="overview"
          href="/dashboard/documents?filter=invoiced"
          label="Invoiced This Week"
          value={week.amount}
          format="compactCurrency"
          currency={currency}
          icon="due"
          delta={
            // A week with nothing in it is not "-100%". That is arithmetically
            // right and reads as a collapse; what happened is that the week is
            // young, or quiet, and last week's figure is the useful context.
            week.amount === 0
              ? {
                  label: "nothing yet",
                  direction: "flat",
                  caption:
                    weekBefore.amount > 0
                      ? `${formatCompactAmount(weekBefore.amount, currency)} last week`
                      : "Monday - Sunday",
                }
              : weekChange == null
                ? { label: `${week.count} raised`, direction: "flat", caption: "Monday - Sunday" }
                : {
                    label: formatDelta(weekChange),
                    direction: weekChange >= 0 ? "up" : "down",
                    caption: "vs last week",
                  }
          }
        />
      </StatRow>

      {stats.otherCurrencyCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.otherCurrencyCount} document
          {stats.otherCurrencyCount === 1 ? " is" : "s are"} in another currency and{" "}
          {stats.otherCurrencyCount === 1 ? "is" : "are"} not included in the figures above.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-xl border bg-card p-5 lg:col-span-8">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Invoice Trends
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                What you invoiced each month, by the date on the document.
              </p>
            </div>
            <span className="flex items-center gap-2 text-xs">
              {yearChange != null && (
                <span className="text-muted-foreground">
                  {formatDelta(yearChange)} vs last year
                </span>
              )}
              <span className="rounded-md border px-2 py-1 text-muted-foreground">
                {now.getUTCFullYear()}
              </span>
            </span>
          </header>
          <AreaChart points={trend} format="currency" currency={currency} />
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <PieChart className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Invoiced by Payment Status
          </h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            This year, by value. Every invoice falls in exactly one band.
          </p>
          {byStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing invoiced this year yet.</p>
          ) : (
            <DonutChart
              slices={byStatus}
              centreLabel="Invoiced"
              format="compactCurrency"
              currency={currency}
            />
          )}
        </section>
      </div>

      <DocumentsTable
        activeFilter={activeFilter}
        rows={visible.map(({ doc }) => {
          const total = doc.totalAmount != null ? Number(doc.totalAmount) : null
          // Only an invoice carries a ledger; a quotation has no balance to
          // chase and a contract has no money on it at all.
          const tracksPayments =
            doc.type === "INVOICE" && doc.status !== "DRAFT" && doc.status !== "VOID"
          const summary = tracksPayments
            ? paymentSummary(
                total,
                Number(doc.amountPaid),
                doc.dueDate,
                false,
                doc.currency,
                Number(doc.advanceReceived),
                now
              )
            : null

          return {
            id: doc.id,
            refLabel: doc.refNumber || doc.title || "Untitled draft",
            typeLabel: documentKind(doc.type).label,
            type: doc.type,
            clientName: doc.client?.businessName || doc.client?.fullName || "No Client",
            status: doc.status,
            totalAmount: total,
            amountPaid: Number(doc.amountPaid),
            advanceReceived: Number(doc.advanceReceived),
            dueDate: doc.dueDate,
            currency: doc.currency,
            amountText: total != null ? formatMoney(total, doc.currency) : "-",
            balanceText: summary ? formatMoney(summary.balance, doc.currency) : "-",
            // Pinned to UTC like every other document date. toLocaleDateString()
            // renders in the server's zone, which is not the operator's and not
            // the one the document itself was dated in.
            issueDateText: formatTableDay(doc.issueDate ?? doc.createdAt),
            dueDateText: formatTableDay(doc.dueDate),
          }
        })}
        emptyMessage={
          documents.length === 0
            ? "No documents yet. Create one and it will appear here."
            : activeFilter === DEFAULT_FILTER
              ? "Nothing needs attention - everything is settled or closed."
              : "No documents match this filter."
        }
      />
    </div>
  )
}
