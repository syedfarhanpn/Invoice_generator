/**
 * Number formatting for dashboards and reports.
 *
 * Deliberately separate from src/lib/money.ts. That module formats money on
 * documents - invoices, receipts, PDFs - where the figure is a legal record
 * and must never be rounded or abbreviated. This one is for figures you
 * glance at, where "₹24.8L" beats "₹2,480,000.00" and losing the paise costs
 * nothing. Never use this on a document.
 */

/** Indian digit grouping: 4,85,000 rather than 485,000. */
const INDIAN_GROUPING = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })

const PLAIN = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

/** The symbol alone, so the caller can place it. Falls back to the code. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0)
    return parts.find((p) => p.type === "currency")?.value ?? currency
  } catch {
    return currency
  }
}

/**
 * A full figure with its symbol, grouped the way the currency's readers group.
 * "₹4,85,000" for INR, "$485,000" otherwise.
 */
export function formatAmount(value: number, currency: string): string {
  const rounded = Math.round(value || 0)
  const grouped = currency === "INR" ? INDIAN_GROUPING.format(rounded) : PLAIN.format(rounded)
  return `${currencySymbol(currency)}${grouped}`
}

/**
 * Abbreviated for tight spaces: "₹24.8L", "₹1.2Cr", "$1.2M".
 *
 * Indian currency abbreviates in lakh and crore, which is what the references
 * use and what the operator reads. Everything else uses K/M/B, because "L" in
 * front of a dollar figure would mean nothing to anyone.
 */
export function formatCompactAmount(value: number, currency: string): string {
  const symbol = currencySymbol(currency)
  const n = Math.abs(value || 0)
  const sign = value < 0 ? "-" : ""

  const scaled: [number, string][] =
    currency === "INR"
      ? [
          [1e7, "Cr"],
          [1e5, "L"],
          [1e3, "K"],
        ]
      : [
          [1e9, "B"],
          [1e6, "M"],
          [1e3, "K"],
        ]

  for (const [unit, suffix] of scaled) {
    if (n >= unit) {
      const v = n / unit
      // One decimal below 100, none above: "24.8L" but "248L", so the figure
      // never grows wider than the space the card reserved for it.
      return `${sign}${symbol}${v >= 100 ? Math.round(v) : v.toFixed(1)}${suffix}`
    }
  }
  return `${sign}${symbol}${Math.round(n)}`
}

/** "+28%" / "-12%". The sign is the point, so it is always shown. */
export function formatDelta(percent: number): string {
  const rounded = Math.round(percent * 10) / 10
  const shown = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${rounded > 0 ? "+" : ""}${shown}%`
}

/**
 * Percentage change between two periods.
 *
 * Returns null rather than Infinity when the earlier period was zero: "up
 * from nothing" is not a percentage, and rendering ∞% or 100% would both be
 * lies. The caller shows "new" instead.
 *
 * `minBase` extends that to bases that are technically non-zero but too
 * small to divide by. Twenty-one projects where there was one is a true
 * "+2000%" and a useless thing to print: the reader learns the denominator
 * was tiny, not that anything grew twentyfold. Callers counting whole things
 * pass a floor and fall back to the absolute count below it.
 */
export function percentChange(
  current: number,
  previous: number,
  minBase = 1
): number | null {
  if (!previous || Math.abs(previous) < minBase) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

/**
 * How a figure should be rendered, named rather than supplied as a function.
 *
 * Server Components cannot pass a closure to a Client Component - functions
 * are not serializable across that boundary, and doing it throws at render
 * time with no type error to warn you. The animated cards need to format
 * intermediate values as a number counts up, so they need the formatting
 * *logic*, not a pre-formatted string. Passing the name and resolving it on
 * the client side gives them both.
 */
export type ValueFormat = "currency" | "compactCurrency" | "integer" | "percent"

export function formatValue(
  value: number,
  format: ValueFormat,
  currency = "INR"
): string {
  switch (format) {
    case "currency":
      return formatAmount(value, currency)
    case "compactCurrency":
      return formatCompactAmount(value, currency)
    case "percent":
      return `${Math.round(value)}%`
    case "integer":
      return INDIAN_GROUPING.format(Math.round(value || 0))
  }
}
