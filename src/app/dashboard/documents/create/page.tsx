import { requirePermission } from "@/lib/access"
import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/db"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import { DocumentType, Prisma } from "@prisma/client"
import type { InvoiceContent, ContractContent } from "@/lib/types"
import { CREATABLE_TYPES, documentKind } from "@/lib/document-kinds"

export const metadata = { title: "Creating document..." }

const ALLOWED_TYPES: readonly DocumentType[] = CREATABLE_TYPES

export default async function CreateDocumentAction(props: {
  searchParams: Promise<{ type?: string; client?: string }>
}) {
  await requirePermission("documents", "write")

  const searchParams = await props.searchParams
  const type = searchParams.type as DocumentType
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return notFound()
  }

  const { workspaceId } = await getWorkspaceIdentity()

  const [businessProfile, client] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId: workspaceId } }),
    searchParams.client
      ? prisma.client.findUnique({ where: { id: searchParams.client, userId: workspaceId } })
      : Promise.resolve(null),
  ])

  const currency = client?.defaultCurrency || businessProfile?.currency || "USD"

  const kind = documentKind(type)

  let initialContent: InvoiceContent | ContractContent
  if (kind.isLineItemDoc) {
    initialContent = {
      lineItems: [{ description: "", qty: 1, rate: 0 }],
      // Seeded from settings so standard wording is not retyped every time;
      // still editable on the document itself.
      notes: businessProfile?.defaultInvoiceNote ?? "",
    } satisfies InvoiceContent
  } else {
    initialContent = {
      clauses: [
        { title: "Scope of Work", body: "" },
        { title: "Payment Terms", body: "" },
      ],
      effectiveDate: null,
      scopeSummary: "",
      totalFee: null,
      feeNote: "",
    } satisfies ContractContent
  }

  const doc = await prisma.document.create({
    data: {
      userId: workspaceId,
      clientId: client?.id || null,
      type,
      status: "DRAFT",
      title: `New ${kind.label}`,
      currency,
      taxMode: businessProfile?.defaultTaxMode ?? "NONE",
      taxRate: businessProfile?.defaultTaxRate ?? null,
      taxLabel: businessProfile?.defaultTaxLabel ?? null,
      content: initialContent as unknown as Prisma.InputJsonValue,
    },
  })

  await prisma.documentActivity.create({
    data: { documentId: doc.id, event: "created" },
  })

  redirect(`/dashboard/documents/${doc.id}`)
}
