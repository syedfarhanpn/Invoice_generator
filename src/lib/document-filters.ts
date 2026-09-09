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
  | "active"
  | "all"
  | "drafts"
  | "quotes"
  | "proformas"
  | "invoiced"
  | "outstanding"
  | "paid"
  | "overdue"
  | "void"

export const DOCUMENT_FILTERS: { key: FilterKey; label: string }[] = [
  // Default view: everything still needing action. Settled and cancelled
  // documents are noise here - they are one click away under All / Void.
  { key: "active", label: "Needs attention" },
  { key: "all", label: "All" },
  { key: "drafts", label: "Drafts" },
  { key: "quotes", label: "Quotations" },
  { key: "proformas", label: "Proformas" },
  { key: "invoiced", label: "Invoiced" },
  { key: "outstanding", label: "Outstanding" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
  // Void is opt-in: cancelled documents only appear when explicitly asked for.
  { key: "void", label: "Void" },
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
/** The view shown when no filter is chosen. */
export const DEFAULT_FILTER: FilterKey = "active"

/** Narrows an untrusted ?filter= value; anything unknown falls back to the default. */
export function parseFilter(value: string | undefined): FilterKey {
  const match = DOCUMENT_FILTERS.find((f) => f.key === value)
  return match ? match.key : DEFAULT_FILTER
}

/** Money still owed on an issued invoice, in minor units. */
function outstandingBalanceMinor(doc: FilterableDoc): number {
  return paymentSummary(
    doc.totalAmount,
    doc.amountPaid,
    doc.dueDate,
    false,
    doc.currency,
    doc.advanceReceived
  ).balanceMinor
}

export function matchesFilter(doc: FilterableDoc, key: FilterKey): boolean {
  // "all" still means all, including void - it is the escape hatch.
  if (key === "all") return true
  if (key === "void") return doc.status === "VOID"
  if (key === "drafts") return doc.status === "DRAFT"

  if (key === "active") {
    // Cancelled documents are never outstanding work.
    if (doc.status === "VOID") return false
    // Not yet issued, so still on your plate.
    if (doc.status === "DRAFT") return true
    // Terminal states: a signed contract or an archived document is finished.
    if (doc.status === "SIGNED" || doc.status === "ARCHIVED") return false
    // Quotes, proformas and unsigned contracts have no payment ledger, so
    // being issued and not yet terminal is itself the outstanding state
    // (awaiting acceptance or signature).
    if (doc.type !== "INVOICE") return true
    // An issued invoice drops out only once it is fully paid.
    return outstandingBalanceMinor(doc) > 0
  }

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
