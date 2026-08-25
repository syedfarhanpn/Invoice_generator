// Small curated list rather than the full ISO-4217 table - enough to cover
// what a freelancer/agency actually invoices in. Add more as needed; every
// consumer of this file falls back gracefully for an unlisted code.
export const CURRENCIES = [
  { code: "USD", label: "USD - US Dollar", symbol: "$" },
  { code: "EUR", label: "EUR - Euro", symbol: "€" },
  { code: "GBP", label: "GBP - British Pound", symbol: "£" },
  { code: "INR", label: "INR - Indian Rupee", symbol: "₹" },
  { code: "CAD", label: "CAD - Canadian Dollar", symbol: "$" },
  { code: "AUD", label: "AUD - Australian Dollar", symbol: "$" },
  { code: "AED", label: "AED - UAE Dirham", symbol: "د.إ" },
  { code: "SGD", label: "SGD - Singapore Dollar", symbol: "$" },
  { code: "JPY", label: "JPY - Japanese Yen", symbol: "¥" },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]["code"]

const DECIMALS_OVERRIDE: Record<string, number> = {
  JPY: 0,
}

/** Number of minor-unit decimal places for a currency (2 for USD/INR, 0 for JPY, ...). */
export function currencyDecimals(currency: string): number {
  if (currency in DECIMALS_OVERRIDE) return DECIMALS_OVERRIDE[currency]
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

export function currencySymbol(currency: string): string {
  return CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency
}
