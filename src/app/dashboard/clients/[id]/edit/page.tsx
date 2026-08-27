import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { notFound } from "next/navigation"
import EditClientForm from "./edit-form"

export const metadata = { title: "Edit client" }

export default async function EditClientPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const user = await getCurrentUser()

  const client = await prisma.client.findUnique({
    where: { id: params.id, userId: user.id },
    include: { _count: { select: { documents: true } } },
  })
  if (!client) return notFound()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Edit Client</h2>
        <p className="text-muted-foreground">{client.fullName}</p>
      </div>
      <EditClientForm
        clientId={client.id}
        codeLocked={client._count.documents > 0}
        initial={{
          fullName: client.fullName,
          businessName: client.businessName ?? "",
          code: client.code,
          email: client.email,
          phone: client.phone ?? "",
          address: client.address ?? "",
          country: client.country ?? "",
          taxId: client.taxId ?? "",
          notes: client.notes ?? "",
          tags: client.tags,
          defaultCurrency: client.defaultCurrency ?? "",
        }}
      />
    </div>
  )
}
