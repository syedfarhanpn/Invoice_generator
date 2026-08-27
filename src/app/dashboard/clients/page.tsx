import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import prisma from "@/lib/db"
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

      <Card>
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted text-muted-foreground border-b">
              <tr>
                <th className="p-4 font-medium">Code</th>
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Business</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Docs</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="p-4 font-mono text-xs">
                    <Badge variant="outline">{client.code}</Badge>
                  </td>
                  <td className="p-4 font-medium">
                    <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                      {client.fullName}
                    </Link>
                    {client.archivedAt && <span className="ml-2 text-xs text-muted-foreground">(archived)</span>}
                  </td>
                  <td className="p-4 text-muted-foreground">{client.businessName || "-"}</td>
                  <td className="p-4 text-muted-foreground">{client.email}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      {client._count.documents}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <Link href={`/dashboard/clients/${client.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    No clients found. Add your first client to get started.
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
