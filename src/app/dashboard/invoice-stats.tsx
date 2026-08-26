import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { formatMoney, paymentSummary } from "@/lib/money"
import { currencyDecimals } from "@/lib/currencies"
import { Receipt, Wallet, CircleDollarSign, AlertCircle } from "lucide-react"

/**
 * Money totals for issued invoices. Summed in integer minor units (see
 * src/lib/money.ts) and derived through paymentSummary(), so these cards can
 * never disagree with the per-row PaymentBadge.
 */
export default async function InvoiceStats() {
  const user = await getCurrentUser()

  const [businessProfile, invoices] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId: user.id } }),
    prisma.document.findMany({
      where: {
        userId: user.id,
        type: "INVOICE",
        // Drafts were never billed; voids were cancelled after the fact.
        status: { notIn: ["DRAFT", "VOID"] },
      },
      select: { totalAmount: true, amountPaid: true, dueDate: true, currency: true },
    }),
  ])

  const defaultCurrency = businessProfile?.currency || "USD"
  const decimals = currencyDecimals(defaultCurrency)
  const toMajor = (minor: number) => minor / 10 ** decimals

  // Totals only make sense within one currency, so foreign invoices are
  // excluded and called out below rather than silently added together.
  const inCurrency = invoices.filter((i) => i.currency === defaultCurrency)
  const hasMixedCurrencies = invoices.length !== inCurrency.length

  let invoicedMinor = 0
  let receivedMinor = 0
  let pendingMinor = 0
  let overdueMinor = 0
  let overdueCount = 0

  for (const invoice of inCurrency) {
    const summary = paymentSummary(
      invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
      Number(invoice.amountPaid),
      invoice.dueDate,
      false,
      invoice.currency
    )
    invoicedMinor += summary.totalMinor
    receivedMinor += summary.paidMinor
    pendingMinor += summary.balanceMinor
    if (summary.isOverdue) {
      overdueMinor += summary.balanceMinor
      overdueCount += 1
    }
  }

  const stats = [
    {
      label: "Total Invoiced",
      value: formatMoney(toMajor(invoicedMinor), defaultCurrency),
      hint: `${inCurrency.length} invoice${inCurrency.length === 1 ? "" : "s"} issued`,
      icon: Receipt,
      tone: "text-muted-foreground",
    },
    {
      label: "Received",
      value: formatMoney(toMajor(receivedMinor), defaultCurrency),
      hint: "Paid to date",
      icon: Wallet,
      tone: "text-muted-foreground",
    },
    {
      label: "Pending",
      value: formatMoney(toMajor(pendingMinor), defaultCurrency),
      hint: "Awaiting payment",
      icon: CircleDollarSign,
      tone: "text-muted-foreground",
    },
    {
      label: "Overdue",
      value: formatMoney(toMajor(overdueMinor), defaultCurrency),
      hint: `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} past due`,
      icon: AlertCircle,
      tone: overdueMinor > 0 ? "text-destructive" : "text-muted-foreground",
    },
  ]

  return (
    <div className="space-y-2">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className={`size-4 ${stat.tone}`} />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className={`text-2xl font-bold ${stat.label === "Overdue" ? stat.tone : ""}`}>
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {hasMixedCurrencies && (
        <p className="text-xs text-muted-foreground">
          Totals cover {defaultCurrency} invoices only - you also have invoices in other currencies.
        </p>
      )}
    </div>
  )
}
