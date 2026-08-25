import { redirect, notFound } from "next/navigation"
import prisma from "@/lib/db"
import { DocumentType, Prisma } from "@prisma/client"
import { getCurrentUser } from "@/lib/current-user"
import type { InvoiceContent, ContractContent } from "@/lib/types"

const ALLOWED_TYPES: DocumentType[] = ["INVOICE", "CONTRACT"]

export default async function CreateDocumentAction(props: {
  searchParams: Promise<{ type?: string; client?: string }>
}) {
  const searchParams = await props.searchParams
  const type = searchParams.type as DocumentType
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return notFound()
  }

  const user = await getCurrentUser()

  const [businessProfile, client] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId: user.id } }),
    searchParams.client
      ? prisma.client.findUnique({ where: { id: searchParams.client, userId: user.id } })
      : Promise.resolve(null),
  ])

  const currency = client?.defaultCurrency || businessProfile?.currency || "USD"

  let initialContent: InvoiceContent | ContractContent
  if (type === "INVOICE") {
    initialContent = {
      lineItems: [{ description: "", qty: 1, rate: 0 }],
      notes: "",
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
      userId: user.id,
      clientId: client?.id || null,
      type,
      status: "DRAFT",
      title: type === "INVOICE" ? "New Invoice" : "New Contract",
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
