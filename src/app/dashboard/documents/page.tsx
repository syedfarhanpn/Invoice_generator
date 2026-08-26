import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { LifecycleBadge, PaymentBadge } from "@/components/app/status-badge"
import { DocumentFilterBar } from "@/components/app/document-filter-bar"
import { countByFilter, matchesFilter, parseFilter, type FilterableDoc } from "@/lib/document-filters"
import { formatMoney } from "@/lib/money"

export default async function DocumentsHistoryPage(props: {
  searchParams: Promise<{ filter?: string }>
}) {
  const [searchParams, user] = await Promise.all([props.searchParams, getCurrentUser()])
  const activeFilter = parseFilter(searchParams.filter)

  const documents = await prisma.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { client: true },
  })

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
    } satisfies FilterableDoc,
  }))

  const counts = countByFilter(rows.map((r) => r.filterable))
  const visible = rows.filter((r) => matchesFilter(r.filterable, activeFilter))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Documents</h2>
          <p className="text-muted-foreground">History of every invoice and contract you&apos;ve created.</p>
        </div>
        <Link href="/dashboard/documents/new" className={buttonVariants()}>
          Create Document
        </Link>
      </div>

      <DocumentFilterBar active={activeFilter} counts={counts} />

      <Card>
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted text-muted-foreground border-b">
              <tr>
                <th className="p-4 font-medium">Reference</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Client</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Amount</th>
                <th className="p-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ doc }) => (
                <tr key={doc.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="p-4 font-medium">
                    <Link href={`/dashboard/documents/${doc.id}`} className="hover:underline text-primary">
                      {doc.refNumber || doc.title || "Untitled draft"}
                    </Link>
                  </td>
                  <td className="p-4 text-muted-foreground">{doc.type}</td>
                  <td className="p-4">{doc.client?.businessName || doc.client?.fullName || "No Client"}</td>
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
                  <td className="p-4 text-right">
                    {doc.totalAmount != null ? formatMoney(Number(doc.totalAmount), doc.currency) : "-"}
                  </td>
                  <td className="p-4 text-muted-foreground">{doc.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    {documents.length === 0
                      ? "No documents found."
                      : "No documents match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
