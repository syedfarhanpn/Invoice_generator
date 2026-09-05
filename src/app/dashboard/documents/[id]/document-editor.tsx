import type { BusinessProfile, Client, Document, DocumentActivity, DocumentType, Payment } from "@prisma/client"
import InvoiceEditor from "./invoice-editor"
import ContractEditor from "./contract-editor"

export type ConversionLink = { id: string; refNumber: string | null }

/**
 * The editors are Client Components, and Prisma Decimal is not serialisable
 * across that boundary - React rejects it outright. Money is converted to
 * plain numbers here, once, rather than in each editor.
 */
export type EditorDocument = Omit<
  Document,
  "subtotal" | "taxAmount" | "totalAmount" | "amountPaid" | "advanceReceived" | "taxRate"
> & {
  subtotal: number | null
  taxAmount: number | null
  totalAmount: number | null
  amountPaid: number
  advanceReceived: number
  taxRate: number | null
  client: Client | null
  convertedTo: ConversionLink[]
  convertedFrom: ConversionLink | null
}

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
    receiptNumber: p.receiptNumber,
  }))

  const editorDocument: EditorDocument = {
    ...document,
    subtotal: document.subtotal != null ? Number(document.subtotal) : null,
    taxAmount: document.taxAmount != null ? Number(document.taxAmount) : null,
    totalAmount: document.totalAmount != null ? Number(document.totalAmount) : null,
    amountPaid: Number(document.amountPaid),
    advanceReceived: Number(document.advanceReceived),
    taxRate: document.taxRate != null ? Number(document.taxRate) : null,
  }

  if (document.type === "CONTRACT") {
    return <ContractEditor document={editorDocument} businessProfile={businessProfile} clients={clients} />
  }

  // INVOICE / PROFORMA / QUOTE all price the same way, so they share one
  // editor and read their labels from src/lib/document-kinds.ts.
  return <InvoiceEditor document={editorDocument} businessProfile={businessProfile} clients={clients} payments={payments} />
}
