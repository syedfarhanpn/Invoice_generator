import { currencyDecimals } from "./currencies"
import type { FilterableDoc } from "./document-filters"
import { paymentSummary } from "./money"

/**
 * The money figures above the documents list.
 *
 * Every number comes out of paymentSummary() - the same helper the
 * PaymentBadge and the filter chips use - so a row badged "Overdue" is counted
 * as overdue up top. Deriving them separately is how a list and its own
 * summary end up disagreeing.
 *
 * Summed in integer minor units and converted once at the end, as the rest of
 * the money code does: adding a hundred rupee-and-paise floats drifts.
 *
 * Two deliberate choices about not double-counting:
 *
 *  - Received is `invoiced - outstanding`, not a second sum of payments. An
 *    overpaid invoice has paidMinor above totalMinor while balanceMinor floors
 *    at zero, so summing payments directly would make received exceed invoiced
 *    and the two would stop describing one pot of money.
 *  - Overdue is a SUBSET of outstanding, not a fourth bucket. It is shown as a
 *    caption under outstanding rather than beside it, because adding the two
 *    counts the same unpaid rupee twice.
 */

export type DocumentStats = {
  currency: string
  /** Billed on issued invoices. Drafts and voids were never billed. */
  invoiced: number
  /** invoiced - outstanding. See the note above. */
  received: number
  outstanding: number
  outstandingCount: number
  /** Part of `outstanding`, never additional to it. */
  overdue: number
  overdueCount: number
  /** Issued quotations and proformas still awaiting a decision. */
  quoted: number
  quotedCount: number
  draftCount: number
  /** Rows left out of every figure because they are in another currency. */
  otherCurrencyCount: number
}

/** Quotes and proformas: money asked for, not money billed. */
const PIPELINE_TYPES = new Set(["QUOTE", "PROFORMA"])

export function summariseDocuments(docs: FilterableDoc[], currency: string): DocumentStats {
  const decimals = currencyDecimals(currency)
  const factor = 10 ** decimals
  const toMinor = (major: number | null | undefined) => Math.round((Number(major) || 0) * factor)

  let invoicedMinor = 0
  let outstandingMinor = 0
  let overdueMinor = 0
  let quotedMinor = 0
  let outstandingCount = 0
  let overdueCount = 0
  let quotedCount = 0
  let draftCount = 0
  let otherCurrencyCount = 0

  for (const doc of docs) {
    if (doc.currency !== currency) {
      otherCurrencyCount += 1
      continue
    }

    // A draft is work in progress, not a billed amount. Counted, not totalled.
    if (doc.status === "DRAFT") {
      draftCount += 1
      continue
    }
    // A void document was cancelled; its number stays allocated but its money
    // never existed.
    if (doc.status === "VOID") continue

    if (PIPELINE_TYPES.has(doc.type)) {
      // An archived quote is a decision already taken, either way.
      if (doc.status !== "ARCHIVED") {
        quotedMinor += toMinor(doc.totalAmount)
        quotedCount += 1
      }
      continue
    }

    // Contracts carry no payment ledger, so they appear in no money figure.
    if (doc.type !== "INVOICE") continue

    const summary = paymentSummary(
      doc.totalAmount,
      doc.amountPaid,
      doc.dueDate,
      false,
      doc.currency,
      doc.advanceReceived
    )

    invoicedMinor += summary.totalMinor

    if (summary.balanceMinor > 0) {
      outstandingMinor += summary.balanceMinor
      outstandingCount += 1
    }
    if (summary.isOverdue) {
      overdueMinor += summary.balanceMinor
      overdueCount += 1
    }
  }

  return {
    currency,
    invoiced: invoicedMinor / factor,
    // Derived, never summed separately - see the note at the top.
    received: (invoicedMinor - outstandingMinor) / factor,
    outstanding: outstandingMinor / factor,
    outstandingCount,
    overdue: overdueMinor / factor,
    overdueCount,
    quoted: quotedMinor / factor,
    quotedCount,
    draftCount,
    otherCurrencyCount,
  }
}
