import type { DocumentStatus, DocumentType } from "@prisma/client"

import { currencyDecimals } from "./currencies"
import { paymentSummary } from "./money"

/**
 * What was invoiced, and when.
 *
 * The figures above the documents list ask a different question from
 * document-stats.ts: that one describes the state of the book right now - what
 * is owed, what is out for decision - while this one is about periods. How
 * much went out this month, this week, this year, and how that compares with
 * the one before.
 *
 * Pure, so it can be tested without a database. Summed in integer minor units
 * and converted once at the end, like every other money path here: adding a
 * hundred rupee-and-paise floats drifts.
 *
 * Only ISSUED INVOICES count. A draft was never billed, a void one was
 * cancelled, and a quotation is a price someone asked for rather than money
 * owed - putting any of them in "invoiced" would make the headline a number
 * nobody can reconcile against their books.
 */

export type InvoicedDoc = {
  type: DocumentType
  status: DocumentStatus
  totalAmount: number | null
  amountPaid: number
  advanceReceived: number
  dueDate: Date | null
  /** Set when the document was issued; null while it is still a draft. */
  issueDate: Date | null
  createdAt: Date
  currency: string
  clientId: string | null
}

export type MonthAmount = { label: string; value: number }

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })

/**
 * The date an invoice counts on.
 *
 * issueDate is what the client sees printed on it, so it is what the month a
 * figure belongs to should follow. It is null until the document is finalised,
 * and the rows this reads are already filtered to issued ones - but the
 * fallback stays, because a row issued before issueDate existed would
 * otherwise drop out of every period silently.
 */
export function billedOn(doc: InvoicedDoc): Date {
  return doc.issueDate ?? doc.createdAt
}

/** Issued invoices only. See the note at the top of this file. */
export function isBilled(doc: InvoicedDoc): boolean {
  return doc.type === "INVOICE" && doc.status !== "DRAFT" && doc.status !== "VOID"
}

/** Midnight UTC on the day this instant falls in. */
function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

/**
 * The Monday of the week an instant falls in, as the reference labels the
 * card "Monday - Sunday".
 *
 * getUTCDay() calls Sunday 0, so a plain subtraction would walk Sunday back
 * six days into the week that has just ended rather than to the Monday that
 * started it.
 */
export function weekStart(now: Date): Date {
  const day = now.getUTCDay()
  const backToMonday = day === 0 ? 6 : day - 1
  return new Date(utcDay(now) - backToMonday * 86_400_000)
}

export function monthStart(now: Date, back = 0): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

export function yearStart(now: Date, back = 0): Date {
  return new Date(Date.UTC(now.getUTCFullYear() - back, 0, 1))
}

export type PeriodTotal = {
  /** Invoiced in the window, in major units. */
  amount: number
  /** How many invoices. */
  count: number
  /** Distinct clients billed in the window. An invoice with no client
   *  counts toward `count` but toward nobody's client tally. */
  clients: number
}

/**
 * What was invoiced in [from, to).
 *
 * Half-open on purpose: months and weeks tile without a document landing in
 * two of them, which is what makes "this month" plus "last month" add up.
 */
export function invoicedBetween(
  docs: InvoicedDoc[],
  from: Date,
  to: Date,
  currency: string
): PeriodTotal {
  const decimals = currencyDecimals(currency)
  const factor = 10 ** decimals
  const clients = new Set<string>()
  let minor = 0
  let count = 0

  for (const doc of docs) {
    if (!isBilled(doc) || doc.currency !== currency) continue
    const at = billedOn(doc).getTime()
    if (at < from.getTime() || at >= to.getTime()) continue
    minor += Math.round((Number(doc.totalAmount) || 0) * factor)
    count += 1
    if (doc.clientId) clients.add(doc.clientId)
  }

  return { amount: minor / factor, count, clients: clients.size }
}

/** Twelve buckets for a calendar year, for the trend chart. */
export function invoicedByMonth(
  docs: InvoicedDoc[],
  year: number,
  currency: string
): MonthAmount[] {
  return Array.from({ length: 12 }, (_, month) => {
    const from = new Date(Date.UTC(year, month, 1))
    const to = new Date(Date.UTC(year, month + 1, 1))
    return {
      label: MONTH_LABEL.format(from),
      value: invoicedBetween(docs, from, to, currency).amount,
    }
  })
}

/**
 * Invoiced money split by where it stands: paid, part paid, overdue, unpaid.
 *
 * By VALUE rather than by count, so the slices add up to the same total the
 * headline card shows. The four are mutually exclusive - paymentSummary picks
 * exactly one label per invoice - so nothing is counted twice.
 */
export function invoicedByPaymentStatus(
  docs: InvoicedDoc[],
  from: Date,
  to: Date,
  currency: string,
  now = new Date()
): MonthAmount[] {
  const decimals = currencyDecimals(currency)
  const factor = 10 ** decimals
  const buckets = new Map<string, number>([
    ["Paid", 0],
    ["Partly paid", 0],
    ["Overdue", 0],
    ["Unpaid", 0],
  ])

  for (const doc of docs) {
    if (!isBilled(doc) || doc.currency !== currency) continue
    const at = billedOn(doc).getTime()
    if (at < from.getTime() || at >= to.getTime()) continue

    const summary = paymentSummary(
      doc.totalAmount,
      doc.amountPaid,
      doc.dueDate,
      false,
      doc.currency,
      doc.advanceReceived,
      now
    )
    const key =
      summary.label === "Paid"
        ? "Paid"
        : summary.label === "Partial"
          ? "Partly paid"
          : summary.label === "Overdue"
            ? "Overdue"
            : "Unpaid"

    buckets.set(key, (buckets.get(key) ?? 0) + Math.round((Number(doc.totalAmount) || 0) * factor))
  }

  return [...buckets.entries()]
    .map(([label, minor]) => ({ label, value: minor / factor }))
    .filter((slice) => slice.value > 0)
}
