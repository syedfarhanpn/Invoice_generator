import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { DocumentFilterBar } from "@/components/app/document-filter-bar"
import { countByFilter, matchesFilter, parseFilter, type FilterableDoc } from "@/lib/document-filters"
import { formatMoney } from "@/lib/money"
import { DocumentsTable } from "./documents-table"
import { documentKind } from "@/lib/document-kinds"

export const metadata = { title: "Documents" }

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
      advanceReceived: Number(doc.advanceReceived),
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

      <DocumentsTable
        rows={visible.map(({ doc }) => ({
          id: doc.id,
          refLabel: doc.refNumber || doc.title || "Untitled draft",
          typeLabel: documentKind(doc.type).label,
          type: doc.type,
          clientName: doc.client?.businessName || doc.client?.fullName || "No Client",
          status: doc.status,
          totalAmount: doc.totalAmount != null ? Number(doc.totalAmount) : null,
          amountPaid: Number(doc.amountPaid),
          advanceReceived: Number(doc.advanceReceived),
          dueDate: doc.dueDate,
          currency: doc.currency,
          amountText: doc.totalAmount != null ? formatMoney(Number(doc.totalAmount), doc.currency) : "-",
          dateText: doc.createdAt.toLocaleDateString(),
        }))}
        emptyMessage={documents.length === 0 ? "No documents found." : "No documents match this filter."}
      />
    </div>
  )
}
