import type { DocumentStatus, DocumentType } from "@prisma/client"

import { paymentSummary } from "./money"

/**
 * Filters for the documents list. Payment-derived filters run through
 * paymentSummary() - the same helper the PaymentBadge uses - so both read the
 * same derived numbers.
 *
 * Note "overdue" keys off summary.isOverdue, not summary.label: a partially
 * paid invoice that is past due is genuinely overdue and belongs in that
 * filter, even though its badge reads "Partial" (the label check for a
 * payment on file wins over the due date).
 */
export type FilterKey =
  | "all"
  | "drafts"
  | "quotes"
  | "proformas"
  | "invoiced"
  | "outstanding"
  | "paid"
  | "overdue"

export const DOCUMENT_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "quotes", label: "Quotations" },
  { key: "proformas", label: "Proformas" },
  { key: "invoiced", label: "Invoiced" },
  { key: "outstanding", label: "Outstanding" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
]

/** Minimum shape a row needs to be filtered - Decimals converted to numbers. */
export type FilterableDoc = {
  type: DocumentType
  status: DocumentStatus
  totalAmount: number | null
  amountPaid: number
  dueDate: Date | null
  currency: string
  advanceReceived?: number
}

/** Narrows an untrusted ?filter= value; anything unknown falls back to "all". */
export function parseFilter(value: string | undefined): FilterKey {
  const match = DOCUMENT_FILTERS.find((f) => f.key === value)
  return match ? match.key : "all"
}

export function matchesFilter(doc: FilterableDoc, key: FilterKey): boolean {
  if (key === "all") return true
  if (key === "drafts") return doc.status === "DRAFT"

  // Type filters, not money views - a quote counts as a quote whether it is
  // still a draft, issued, or already converted.
  if (key === "quotes") return doc.type === "QUOTE"
  if (key === "proformas") return doc.type === "PROFORMA"

  // Everything below is a money view of an issued invoice. Contracts have no
  // payment ledger, and drafts/voids were never billed, so they never match.
  if (doc.type !== "INVOICE") return false
  if (doc.status === "DRAFT" || doc.status === "VOID") return false

  const summary = paymentSummary(
    doc.totalAmount,
    doc.amountPaid,
    doc.dueDate,
    false,
    doc.currency,
    doc.advanceReceived
  )

  switch (key) {
    case "invoiced":
      return true
    case "outstanding":
      return summary.balanceMinor > 0
    case "paid":
      return summary.totalMinor > 0 && summary.balanceMinor <= 0
    case "overdue":
      return summary.isOverdue
  }
}

/** Row count per filter, for the chip badges. */
export function countByFilter(docs: FilterableDoc[]): Record<FilterKey, number> {
  const counts = {} as Record<FilterKey, number>
  for (const { key } of DOCUMENT_FILTERS) {
    counts[key] = docs.filter((doc) => matchesFilter(doc, key)).length
  }
  return counts
}
