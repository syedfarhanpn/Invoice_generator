/**
 * Reading a lead export into rows this product can store.
 *
 * The shape of the problem: every ad form asks for name, phone and email, and
 * then asks for whatever that campaign cared about - what business they run,
 * how soon they need it, budget, city. Those extra questions change from ad
 * to ad, so there is no schema to map them onto and inventing columns for
 * this week's form would leave next week's unreadable.
 *
 * So three fields are matched by meaning and everything else is kept
 * verbatim, labelled with its own column heading, into the lead's
 * description. Nothing from the file is discarded, and nothing about the
 * file's layout has to be known in advance.
 *
 * Pure, so the matching rules can be tested without a database or an upload.
 */

export type ParsedLead = {
  name: string
  email: string | null
  phone: string | null
  /** When the lead actually arrived, when the file says. Null means "use
   *  the time of import", which is the best we can do without a column. */
  createdAt: Date | null
  /** Every other column, as "Question: answer" lines. */
  description: string
  /** 1-based line in the file, for reporting what was skipped. */
  line: number
}

export type ParseResult = {
  leads: ParsedLead[]
  /** Headings that went into the description rather than a field. */
  extraColumns: string[]
  /** Rows that could not be used, with the reason. */
  skipped: { line: number; reason: string }[]
  /** Rows whose date column held something unreadable. They still import;
   *  they just fall back to the time of import. */
  unreadableDates: number
}

/** The four fields a column can be assigned to. */
export type LeadField = "name" | "email" | "phone" | "createdAt"

export const LEAD_FIELDS: LeadField[] = ["name", "email", "phone", "createdAt"]

export const LEAD_FIELD_LABEL: Record<LeadField, string> = {
  name: "Name",
  email: "Email address",
  phone: "Phone number",
  createdAt: "Date created",
}

/**
 * Which column feeds which field, by index into the header row.
 *
 * Null means "this file has no such column". The automatic match produces one
 * of these and the operator can change any of it - the headings in a lead
 * export are written by whoever built the ad form, and no list of aliases
 * will ever cover every way someone writes "mobile".
 */
export type LeadMapping = Record<LeadField, number | null>

export const EMPTY_MAPPING: LeadMapping = {
  name: null,
  email: null,
  phone: null,
  createdAt: null,
}

/**
 * Column headings that mean the same thing.
 *
 * Matched loosely - lowercased, with anything that is not a letter removed -
 * so "Full Name", "full_name" and "FULL NAME" all land together. Meta's own
 * exports prefix fields, hence the bare "fullname" as well as "name".
 */
const FIELD_ALIASES: Record<LeadField, string[]> = {
  name: ["name", "fullname", "firstname", "yourname", "leadname", "contactname", "customername"],
  email: ["email", "emailaddress", "mail", "emailid", "workemail"],
  phone: [
    "phone",
    "phonenumber",
    "number",
    "mobile",
    "mobilenumber",
    "contact",
    "contactnumber",
    "whatsapp",
    "whatsappnumber",
    "tel",
    "telephone",
  ],
  createdAt: [
    "createdat",
    "created",
    "createdtime",
    "createdon",
    "datecreated",
    "date",
    "submittedat",
    "submittedon",
    "submissiondate",
    "timestamp",
    "leadcreatedtime",
  ],
}

/** Lowercase letters and digits only, so separators and case stop mattering. */
function normaliseHeading(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function matchField(heading: string): LeadField | null {
  const key = normaliseHeading(heading)
  if (!key) return null
  for (const field of LEAD_FIELDS) {
    if (FIELD_ALIASES[field].includes(key)) return field
  }
  return null
}

/** The header row on its own, so the UI can offer them before parsing. */
export function readHeadings(text: string): string[] {
  const rows = parseCsv(text)
  return rows.length === 0 ? [] : rows[0].map((h) => h.trim())
}

/**
 * A first guess at which column is which.
 *
 * A starting point for the operator to correct, not an answer. The first
 * column claiming a field wins, so a file with both "Name" and "Full name"
 * does not have the second quietly overwrite the first.
 */
export function suggestMapping(headings: string[]): LeadMapping {
  const mapping: LeadMapping = { ...EMPTY_MAPPING }
  headings.forEach((heading, i) => {
    const field = matchField(heading)
    if (field && mapping[field] === null) mapping[field] = i
  })
  return mapping
}

/**
 * A date as a lead export writes it.
 *
 * ISO first, because that is what Meta and every API produce and it is the
 * only unambiguous form. Then the slash and dash formats a spreadsheet
 * exports, read DAY FIRST: this is an Indian agency, 03/04/2026 means 3 April
 * there, and guessing the other way would silently move a third of all dates.
 * Where one part is above 12 the order is not in doubt and is used directly.
 *
 * Returns null rather than a wrong date when it cannot tell. The caller falls
 * back to the time of import, which is honest; a date invented from a
 * misread string is not.
 */
export function parseLeadDate(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  // ISO, with or without a time and zone.
  if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(trimmed)) {
    const parsed = new Date(trimmed.replace(" ", "T"))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (match) {
    const [, first, second, year] = match
    let day = Number(first)
    let month = Number(second)
    // Unambiguous the other way round: 10/25/2026 can only be month first.
    if (day > 12 && month <= 12) {
      // Already day-first; nothing to swap.
    } else if (month > 12 && day <= 12) {
      ;[day, month] = [month, day]
    }
    if (day < 1 || day > 31 || month < 1 || month > 12) return null
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year)
    const parsed = new Date(Date.UTC(fullYear, month - 1, day, 12))
    // Rejects 31 February, which Date would roll into March.
    if (parsed.getUTCDate() !== day || parsed.getUTCMonth() !== month - 1) return null
    return parsed
  }

  // "12 Oct 2025" and similar. Date handles these, and they carry a month
  // name so there is no order to misread.
  if (/[a-z]{3}/i.test(trimmed)) {
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return null

    // A written date with no time is read as LOCAL midnight, which in any
    // zone east of UTC becomes the previous day the moment it is stored.
    // Rebuilt at UTC noon from the parts that were actually written, so
    // "12 Oct" stays the 12th wherever the server happens to be. A string
    // that carried its own time is left alone - it meant a real instant.
    const hasTime = /\d:\d/.test(trimmed)
    if (hasTime) return parsed
    return new Date(
      Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12)
    )
  }

  return null
}

/**
 * Splits CSV text into rows of cells.
 *
 * Hand-rolled rather than a dependency, because the whole grammar is three
 * rules: commas separate, quotes protect, and a doubled quote inside quotes
 * is a literal one. A lead export with a comma in "Delhi, India" or a
 * newline inside an answer is exactly what this has to survive, and both are
 * covered by those rules.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise become part
  // of the first heading and stop it matching anything.
  const input = text.replace(/^﻿/, "")

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      // \r\n is one break, not two.
      if (char === "\r" && input[i + 1] === "\n") i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else {
      cell += char
    }
  }

  // Whatever was still being built when the text ran out.
  if (cell !== "" || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  // A trailing newline leaves one empty row behind; so does a blank line in
  // the middle of a file someone edited by hand.
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

/** Light sanity check, so an obvious typo does not become a dead contact. */
function cleanEmail(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null
}

/**
 * Keeps the digits and a leading +, and nothing else.
 *
 * Deliberately not validated against a country's format: these come from ad
 * forms filled in by hand, and rejecting an unusual one loses a real lead.
 */
function cleanPhone(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const kept = trimmed.replace(/[^\d+]/g, "")
  return kept.replace(/\D/g, "").length >= 6 ? kept : null
}

/**
 * Reads the file into leads using the given column mapping.
 *
 * `mapping` is what the operator confirmed, not a guess made here - call
 * suggestMapping() for the starting point and pass back whatever they
 * corrected it to. Every column NOT assigned to a field goes into the
 * description under its own heading, so changing the mapping changes the
 * description too and nothing from the file is ever lost.
 */
export function parseLeadCsv(text: string, mapping?: LeadMapping): ParseResult {
  const rows = parseCsv(text)
  if (rows.length === 0) {
    return { leads: [], extraColumns: [], skipped: [], unreadableDates: 0 }
  }

  const headings = rows[0].map((h) => h.trim())
  const assigned = mapping ?? suggestMapping(headings)

  // Which fields each column index is claimed by, so the description knows
  // what to leave out.
  const claimed = new Set(
    LEAD_FIELDS.map((field) => assigned[field]).filter((i): i is number => i != null)
  )

  const extraColumns = headings.filter(
    (heading, i) => heading !== "" && !claimed.has(i)
  )

  const leads: ParsedLead[] = []
  const skipped: { line: number; reason: string }[] = []
  let unreadableDates = 0

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r]
    const line = r + 1
    const at = (field: LeadField) => {
      const i = assigned[field]
      return i == null ? "" : (cells[i] ?? "")
    }

    const name = at("name").trim()
    const email = cleanEmail(at("email"))
    const phone = cleanPhone(at("phone"))

    // A lead with no way to reach them is not a lead. Name alone cannot be
    // followed up, and importing it would quietly pad the pipeline.
    if (!email && !phone) {
      skipped.push({ line, reason: "No email or phone number" })
      continue
    }

    const rawDate = at("createdAt").trim()
    const createdAt = rawDate ? parseLeadDate(rawDate) : null
    // Counted so the preview can say so. A row with an unreadable date still
    // imports - losing the lead over a date format would be the worse trade.
    if (rawDate && !createdAt) unreadableDates += 1

    const description = headings
      .map((heading, i) => {
        if (heading === "" || claimed.has(i)) return null
        const answer = (cells[i] ?? "").trim()
        return answer ? `${heading}: ${answer}` : null
      })
      .filter(Boolean)
      .join("\n")

    leads.push({
      // Falling back to the address keeps a nameless row usable - the lead is
      // real, somebody just did not ask for a name.
      name: name || email || phone || `Lead from line ${line}`,
      email,
      phone,
      createdAt,
      description,
      line,
    })
  }

  return { leads, extraColumns, skipped, unreadableDates }
}
