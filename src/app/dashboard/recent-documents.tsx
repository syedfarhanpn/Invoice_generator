import Link from "next/link"
import { Card } from "@/components/ui/card"
import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { LifecycleBadge, PaymentBadge } from "@/components/app/status-badge"

/**
 * The only data-dependent part of the dashboard. Kept in its own async
 * component so page.tsx stays fully static and can be sent as the shell
 * while this streams in behind a <Suspense> boundary.
 */
export default async function RecentDocuments() {
  const user = await getCurrentUser()

  const recentDocs = await prisma.document.findMany({
    where: { userId: user.id },
    take: 8,
    orderBy: { createdAt: "desc" },
    include: { client: true },
  })

  return (
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
  )
}
