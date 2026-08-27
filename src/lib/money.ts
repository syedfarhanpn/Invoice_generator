// All invoice arithmetic happens in integer minor units (paise/cents) so
// repeated qty * rate multiplication and summing never accumulates
// floating-point drift. Convert to/from Prisma's Decimal only at the
// database boundary (see src/lib/allocate-ref.ts and the document actions).
import { currencyDecimals } from "./currencies"

export type LineItem = {
  description: string
  qty: number
  rate: number // major units, e.g. 400.5 for $400.50
}

export type TaxMode = "NONE" | "PERCENTAGE"

/** Round-half-up to the nearest integer minor unit. */
function toMinor(amountMajor: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((amountMajor || 0) * factor)
}

function fromMinor(amountMinor: number, decimals: number): number {
  const factor = 10 ** decimals
  return amountMinor / factor
}

export type Totals = {
  subtotalMinor: number
  taxAmountMinor: number
  totalMinor: number
  subtotal: number
  taxAmount: number
  total: number
}

/**
 * Computes subtotal/tax/total for a set of line items, rounding once per
 * line (qty * rate) and once for tax - never accumulating raw floats.
 */
export function computeTotals(
  lineItems: LineItem[],
  currency: string,
  taxMode: TaxMode,
  taxRate: number | null | undefined
): Totals {
  const decimals = currencyDecimals(currency)

  const subtotalMinor = lineItems.reduce((sum, item) => {
    const qty = Number(item.qty) || 0
    const rateMinor = toMinor(Number(item.rate) || 0, decimals)
    return sum + Math.round(qty * rateMinor)
  }, 0)

  const taxAmountMinor =
    taxMode === "PERCENTAGE" && taxRate
      ? Math.round((subtotalMinor * taxRate) / 100)
      : 0

  const totalMinor = subtotalMinor + taxAmountMinor

  return {
    subtotalMinor,
    taxAmountMinor,
    totalMinor,
    subtotal: fromMinor(subtotalMinor, decimals),
    taxAmount: fromMinor(taxAmountMinor, decimals),
    total: fromMinor(totalMinor, decimals),
  }
}

export function lineAmount(item: LineItem, currency: string): number {
  const decimals = currencyDecimals(currency)
  const rateMinor = toMinor(Number(item.rate) || 0, decimals)
  const qty = Number(item.qty) || 0
  return fromMinor(Math.round(qty * rateMinor), decimals)
}

export function formatMoney(amountMajor: number | null | undefined, currency: string): string {
  const amount = Number(amountMajor) || 0
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "symbol",
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export type PaymentSummary = {
  totalMinor: number
  /** Everything received: the Payment ledger plus any advance carried in. */
  paidMinor: number
  /** The advance component alone, for rendering the "less received" line. */
  advanceMinor: number
  balanceMinor: number
  balance: number
  isOverdue: boolean
  label: "Draft" | "Unpaid" | "Partial" | "Paid" | "Overdue"
}

/**
 * Paid/partial/overdue is always derived from amountPaid vs totalAmount and
 * dueDate - never stored - so it can't drift out of sync with the Payment
 * ledger. Only meaningful once a document is finalized (has a totalAmount).
 */
export function paymentSummary(
  totalAmount: number | null | undefined,
  amountPaid: number | null | undefined,
  dueDate: Date | null | undefined,
  isDraft: boolean,
  currency: string,
  /**
   * Money already in hand when the invoice was raised (a prior advance or
   * earlier milestone). Optional so every existing call site keeps its exact
   * behaviour: omitted means zero, which deducts nothing.
   */
  advanceReceived: number | null | undefined = 0
): PaymentSummary {
  const decimals = currencyDecimals(currency)
  const factor = 10 ** decimals
  const totalMinor = Math.round((Number(totalAmount) || 0) * factor)
  // Negative input would inflate the balance and let an invoice over-bill, so
  // both components are floored at zero.
  const advanceMinor = Math.max(0, Math.round((Number(advanceReceived) || 0) * factor))
  const ledgerMinor = Math.max(0, Math.round((Number(amountPaid) || 0) * factor))
  const paidMinor = ledgerMinor + advanceMinor
  const balanceMinor = Math.max(0, totalMinor - paidMinor)
  const pastDue = !!dueDate && dueDate.getTime() < Date.now()

  let label: PaymentSummary["label"] = "Unpaid"
  if (isDraft) label = "Draft"
  else if (balanceMinor <= 0 && totalMinor > 0) label = "Paid"
  else if (paidMinor > 0) label = "Partial"
  else if (pastDue) label = "Overdue"
  else label = "Unpaid"

  return {
    totalMinor,
    paidMinor,
    advanceMinor,
    balanceMinor,
    balance: fromMinor(balanceMinor, decimals),
    isOverdue: !isDraft && pastDue && balanceMinor > 0,
    label,
  }
}
