/**
 * Adding up the money on a board.
 *
 * Two rules, both about not showing a number that is quietly wrong:
 *
 *  1. Currencies are never added together. ₹45,000 and $2,000 are not 47,000
 *     of anything, and a column total that says so is worse than none. Each
 *     currency gets its own figure.
 *  2. A card with no value is not a card worth zero. The summary says how
 *     many of the cards carried a value at all, so "₹1.2L" over a column of
 *     40 leads where 2 were priced reads as what it is - a floor, not a
 *     forecast.
 *
 * Pure, so the arithmetic is tested without rendering a board.
 */

export type Valued = { value?: number | null; currency?: string | null }

export type MoneyTotal = { currency: string; amount: number }

export type ValueSummary = {
  /** One entry per currency present. The fallback currency comes first. */
  totals: MoneyTotal[]
  /** Cards that carried a positive value. */
  valued: number
  /** Cards considered, priced or not. */
  count: number
}

/** A value worth counting: a real, positive number. */
function amountOf(card: Valued): number | null {
  const v = card.value
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null
}

export function summarizeValues(cards: Valued[], fallbackCurrency: string): ValueSummary {
  const fallback = fallbackCurrency.toUpperCase()
  const byCurrency = new Map<string, number>()
  let valued = 0

  for (const card of cards) {
    const amount = amountOf(card)
    if (amount == null) continue
    valued++
    const currency = (card.currency || fallback).toUpperCase()
    byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount)
  }

  const totals = [...byCurrency]
    .map(([currency, amount]) => ({ currency, amount }))
    // The workspace's own currency leads, so the headline figure is always in
    // the money the operator thinks in; anything else follows, largest first.
    .sort((a, b) =>
      a.currency === fallback ? -1 : b.currency === fallback ? 1 : b.amount - a.amount
    )

  return { totals, valued, count: cards.length }
}

/**
 * The figure to lead with: the fallback currency's total, or zero in it.
 *
 * Zero rather than nothing when no card is priced - an empty space where the
 * total should be reads as a missing feature, and "₹0 · 0 of 40 valued" says
 * exactly what is true.
 */
export function leadingTotal(summary: ValueSummary, fallbackCurrency: string): MoneyTotal {
  return summary.totals[0] ?? { currency: fallbackCurrency.toUpperCase(), amount: 0 }
}
