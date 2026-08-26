import type { BusinessProfile, Client, Document, DocumentActivity, DocumentType, Payment } from "@prisma/client"
import InvoiceEditor from "./invoice-editor"
import ContractEditor from "./contract-editor"

export type ConversionLink = { id: string; refNumber: string | null }

type DocumentWithRelations = Document & {
  client: Client | null
  payments: Payment[]
  activity: DocumentActivity[]
  convertedTo: ConversionLink[]
  convertedFrom: (ConversionLink & { type: DocumentType }) | null
}

export default function DocumentEditor({
  document,
  businessProfile,
  clients,
}: {
  document: DocumentWithRelations
  businessProfile: BusinessProfile | null
  clients: Client[]
}) {
  const payments = document.payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    paidOn: p.paidOn.toISOString(),
    method: p.method,
    reference: p.reference,
    note: p.note,
  }))

  if (document.type === "CONTRACT") {
    return <ContractEditor document={document} businessProfile={businessProfile} clients={clients} />
  }

  // INVOICE / PROFORMA / QUOTE all price the same way, so they share one
  // editor and read their labels from src/lib/document-kinds.ts.
  return <InvoiceEditor document={document} businessProfile={businessProfile} clients={clients} payments={payments} />
}
