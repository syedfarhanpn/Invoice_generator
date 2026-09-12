/**
 * Date formatting for anything that appears on a document.
 *
 * Locale and timezone are pinned rather than ambient, for two reasons:
 *
 * - A client component renders once on the server and again in the browser.
 *   `toLocaleDateString()` reads whatever default locale the runtime has, and
 *   Node's is not the browser's: the server produced "6/9/2026" where Chrome
 *   produced "9/6/2026", hydration failed on the mismatch, and React threw the
 *   server HTML away and re-rendered the whole page on the client.
 * - Document dates are stored at midnight UTC. Rendered in a negative offset
 *   they fall back a day, so a reader in New York would see an invoice dated
 *   the day before the one printed on its own PDF.
 *
 * en-US because that is what the PDFs already pin, and the two have to agree.
 */

const LOCALE = "en-US"

const DATE = new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC" })

const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
})

/**
 * ICU 72 switched the space before AM/PM to U+202F, so Node and the browser
 * can disagree on that one character even with the locale pinned - which is
 * the same hydration failure by another route.
 */
function normalize(text: string): string {
  return text.replace(/[  ]/g, " ")
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** A calendar date: 9/6/2026. Returns `fallback` for null or unparseable input. */
export function formatDocumentDate(
  value: Date | string | number | null | undefined,
  fallback = "-"
): string {
  const date = toDate(value)
  return date ? normalize(DATE.format(date)) : fallback
}

/**
 * An instant: 9/6/2026, 7:30:00 AM. Always UTC, and says so - a signature
 * timestamp is a record of when something happened, so a bare time in a zone
 * the reader cannot see would be worse than no time at all.
 */
export function formatDocumentDateTime(
  value: Date | string | number | null | undefined,
  fallback = "-"
): string {
  const date = toDate(value)
  return date ? `${normalize(DATE_TIME.format(date))} UTC` : fallback
}
