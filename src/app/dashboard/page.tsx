import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { LifecycleBadge, PaymentBadge } from "@/components/app/status-badge"
import { formatMoney } from "@/lib/money"

export default async function DashboardPage() {
  const user = await getCurrentUser()

  const businessProfile = await prisma.businessProfile.findUnique({ where: { userId: user.id } })
  const defaultCurrency = businessProfile?.currency || "USD"

  const [invoices, payments, recentDocs, weekCount] = await Promise.all([
    prisma.document.findMany({
      where: { userId: user.id, type: "INVOICE", status: "FINALIZED" },
      select: { totalAmount: true, amountPaid: true, dueDate: true, currency: true },
    }),
    prisma.payment.findMany({
      where: { document: { userId: user.id } },
      select: { amount: true, paidOn: true, document: { select: { currency: true } } },
    }),
    prisma.document.findMany({
      where: { userId: user.id },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { client: true },
    }),
    prisma.document.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ])

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const sameCurrency = (c: string) => c === defaultCurrency

  const outstanding = invoices
    .filter((i) => sameCurrency(i.currency))
    .reduce((sum, i) => sum + Math.max(0, Number(i.totalAmount || 0) - Number(i.amountPaid || 0)), 0)

  const overdueCount = invoices.filter(
    (i) => sameCurrency(i.currency) && i.dueDate && i.dueDate < now && Number(i.totalAmount || 0) - Number(i.amountPaid || 0) > 0
  ).length

  const paidThisMonth = payments
    .filter((p) => sameCurrency(p.document.currency) && p.paidOn >= monthStart)
    .reduce((sum, p) => sum + Number(p.amount), 0)

  const hasMixedCurrencies = invoices.some((i) => !sameCurrency(i.currency))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <Link href="/dashboard/documents/new" className={buttonVariants()}>
          Create Document
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(outstanding, defaultCurrency)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMoney(paidThisMonth, defaultCurrency)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Created This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weekCount}</div>
          </CardContent>
        </Card>
      </div>
      {hasMixedCurrencies && (
        <p className="text-xs text-muted-foreground">
          Totals above only include {defaultCurrency} documents - you have invoices in other currencies too.
        </p>
      )}

      <div className="mt-8">
        <h3 className="text-xl font-bold tracking-tight mb-4">Recent Documents</h3>
        <Card>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-muted text-muted-foreground border-b">
                <tr>
                  <th className="p-4 font-medium">Reference</th>
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium">Client</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentDocs.map((doc) => (
                  <tr key={doc.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="p-4 font-medium">
                      <Link href={`/dashboard/documents/${doc.id}`} className="hover:underline">
                        {doc.refNumber || doc.title || "Untitled draft"}
                      </Link>
                    </td>
                    <td className="p-4 text-muted-foreground">{doc.type}</td>
                    <td className="p-4">{doc.client?.businessName || doc.client?.fullName || "N/A"}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <LifecycleBadge status={doc.status} />
                        {doc.type === "INVOICE" && doc.status !== "DRAFT" && doc.status !== "VOID" && (
                          <PaymentBadge
                            totalAmount={doc.totalAmount ? Number(doc.totalAmount) : null}
                            amountPaid={Number(doc.amountPaid)}
                            dueDate={doc.dueDate}
                            isDraft={false}
                            currency={doc.currency}
                          />
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground">{doc.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
                {recentDocs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      No documents found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
