import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import prisma from "@/lib/db"
import { ClientsTable } from "./clients-table"
import { getCurrentUser } from "@/lib/current-user"

export const metadata = { title: "Clients" }

export default async function ClientsPage() {
  const user = await getCurrentUser()

  const clients = await prisma.client.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { documents: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Clients</h2>
          <p className="text-muted-foreground">Manage your client database and document history.</p>
        </div>
        <Link href="/dashboard/clients/new" className={buttonVariants()}>
          Add Client
        </Link>
      </div>

      <ClientsTable
        rows={clients.map((client) => ({
          id: client.id,
          code: client.code,
          fullName: client.fullName,
          businessName: client.businessName,
          email: client.email,
          documentCount: client._count.documents,
          archived: client.archivedAt !== null,
        }))}
      />
    </div>
  )
}
