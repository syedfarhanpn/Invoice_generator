import prisma from "@/lib/db"
import { notFound } from "next/navigation"
import DocumentEditor from "./document-editor"
import { getCurrentUser } from "@/lib/current-user"

export const metadata = { title: "Document" }

export default async function DocumentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const user = await getCurrentUser()

  // All three only depend on user.id, so they run as one round-trip instead
  // of three sequential ones - this page is the slowest in the app.
  const [document, businessProfile, clients] = await Promise.all([
    prisma.document.findUnique({
      where: { id: params.id, userId: user.id },
      include: {
        client: true,
        payments: { orderBy: { paidOn: "desc" } },
        activity: { orderBy: { createdAt: "desc" } },
        // Conversion lineage, so the editor can link a quote to the invoice
        // it became (and back again) instead of just erroring on a re-convert.
        convertedTo: { select: { id: true, refNumber: true } },
        convertedFrom: { select: { id: true, refNumber: true, type: true } },
      },
    }),
    prisma.businessProfile.findUnique({
      where: { userId: user.id },
    }),
    prisma.client.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: { fullName: "asc" },
    }),
  ])

  if (!document) return notFound()

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
