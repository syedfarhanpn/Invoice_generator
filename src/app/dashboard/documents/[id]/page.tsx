import prisma from "@/lib/db"
import { notFound } from "next/navigation"
import DocumentEditor from "./document-editor"
import { getCurrentUser } from "@/lib/current-user"

export default async function DocumentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const user = await getCurrentUser()

  const document = await prisma.document.findUnique({
    where: { id: params.id, userId: user.id },
    include: {
      client: true,
      payments: { orderBy: { paidOn: "desc" } },
      activity: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!document) return notFound()

  const businessProfile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
  })

  const clients = await prisma.client.findMany({
    where: { userId: user.id, archivedAt: null },
    orderBy: { fullName: "asc" },
  })

  return (
    <div className="h-[calc(100vh-8rem)] w-full -m-4 md:-m-8">
      {/* We use negative margins to make the editor full bleed within the dashboard layout */}
      <DocumentEditor
        document={document}
        businessProfile={businessProfile}
        clients={clients}
      />
    </div>
  )
}
