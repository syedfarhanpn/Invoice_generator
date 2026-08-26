import type { DocumentType } from "@prisma/client"

/**
 * Everything that varies between document types, in one table.
 *
 * Quotations and proformas are the same shape as an invoice - line items,
 * tax, totals, a client - and differ only in what they *mean*. Rather than
 * fork the editor three ways, the editor and preview read their labels and
 * capabilities from here.
 *
 * They are separate types rather than a switchable "format" on one row on
 * purpose: once a document has been issued to a client under a number, its
 * identity must not be mutable. Turning an accepted quote into an invoice
 * copies forward into a new document (see convertToInvoice) so both sides
 * stay independently auditable.
 */
export type DocumentKindConfig = {
  /** Label in menus and lists. */
  label: string
  /** Heading printed on the document itself. */
  heading: string
  /** Serial prefix, e.g. the INV in INV-ACME-001. */
  prefix: string
  /** Which Client counter column this type's serial comes from. */
  seqColumn: "invoiceSeq" | "contractSeq" | "quoteSeq" | "proformaSeq"
  /** Label for the secondary date field. */
  dateLabel: string
  /** Whether a payment ledger applies. Only a real invoice is a receivable. */
  tracksPayments: boolean
  /** Whether this can be turned into an invoice once the client accepts. */
  convertsToInvoice: boolean
  /** Whether to print the issuer's bank / UPI details. */
  showsPaymentDetails: boolean
  /** Line-item editor (invoice family) vs clause editor (contracts). */
  isLineItemDoc: boolean
  /** Shown under the totals. Legally load-bearing for proformas. */
  disclaimer: string | null
  /** One-liner for the "create document" picker. */
  description: string
}

export const DOCUMENT_KINDS: Record<DocumentType, DocumentKindConfig> = {
  INVOICE: {
    label: "Invoice",
    heading: "Invoice",
    prefix: "INV",
    seqColumn: "invoiceSeq",
    dateLabel: "Due Date",
    tracksPayments: true,
    convertsToInvoice: false,
    showsPaymentDetails: true,
    isLineItemDoc: true,
    disclaimer: null,
    description: "Bill a client, with tax and a shareable link.",
  },
  PROFORMA: {
    label: "Proforma Invoice",
    heading: "Proforma Invoice",
    prefix: "PRO",
    seqColumn: "proformaSeq",
    dateLabel: "Valid Until",
    tracksPayments: false,
    // A proforma is a request for advance payment, so it does carry bank
    // details - but it is not a tax invoice and must say so.
    convertsToInvoice: true,
    showsPaymentDetails: true,
    isLineItemDoc: true,
    disclaimer: "This is a proforma invoice, not a tax invoice. No payment is due against this document alone.",
    description: "Request advance payment or confirm an order before invoicing.",
  },
  QUOTE: {
    label: "Quotation",
    heading: "Quotation",
    prefix: "QUO",
    seqColumn: "quoteSeq",
    dateLabel: "Valid Until",
    tracksPayments: false,
    convertsToInvoice: true,
    showsPaymentDetails: false,
    isLineItemDoc: true,
    disclaimer: "This quotation is an estimate valid until the date shown, and is not a request for payment.",
    description: "Quote a price up front, then convert it once accepted.",
  },
  CONTRACT: {
    label: "Contract",
    heading: "Agreement",
    prefix: "CON",
    seqColumn: "contractSeq",
    dateLabel: "Effective Date",
    tracksPayments: false,
    convertsToInvoice: false,
    showsPaymentDetails: false,
    isLineItemDoc: false,
    disclaimer: null,
    description: "Scope and terms, with in-browser e-signature.",
  },
}

export function documentKind(type: DocumentType): DocumentKindConfig {
  return DOCUMENT_KINDS[type]
}

/** Types that use the line-item editor, in the order they should be offered. */
export const LINE_ITEM_TYPES = ["INVOICE", "PROFORMA", "QUOTE"] as const satisfies readonly DocumentType[]

/** Every type a user can create from the UI. */
export const CREATABLE_TYPES = ["INVOICE", "PROFORMA", "QUOTE", "CONTRACT"] as const satisfies readonly DocumentType[]
