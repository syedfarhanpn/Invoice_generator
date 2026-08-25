import type { BusinessProfile, Client, Document, DocumentActivity, Payment } from "@prisma/client"
import InvoiceEditor from "./invoice-editor"
import ContractEditor from "./contract-editor"

type DocumentWithRelations = Document & {
  client: Client | null
  payments: Payment[]
  activity: DocumentActivity[]
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

  // INVOICE (QUOTE has no editor yet - documents/new excludes it from the UI)
  return <InvoiceEditor document={document} businessProfile={businessProfile} clients={clients} payments={payments} />
}
