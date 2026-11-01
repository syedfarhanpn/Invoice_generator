/**
 * Deleting a client, and everything that hangs off them.
 *
 * Until now a client could only be ARCHIVED once they had ever been billed -
 * see canDeleteClient() in src/lib/bulk-actions.ts, which refuses any client
 * with documents because Document.clientId cascades. That rule is still the
 * right default for the bulk path, where a mis-ticked checkbox would take an
 * invoice ledger with it.
 *
 * This is the deliberate way out: one client at a time, administrators only,
 * with the consequences counted and shown first and the client's own code
 * typed back to confirm. The counting is what makes it honest - "delete this
 * client?" is not a question anyone can answer well, and "this removes 9
 * documents, 4 of them issued invoices, and 11 payment receipts" is.
 *
 * Pure, so the rule and the wording can be tested without a database. The
 * server action in src/app/dashboard/clients/actions.ts does the deleting;
 * this says what will go, what will survive, and whether the confirmation
 * was actually given.
 */

/**
 * What is attached to a client, counted before anything is removed.
 *
 * Every field is a count of rows that the delete WILL remove, except
 * `expenses`, which counts rows that will SURVIVE - see the note on
 * clientDeletionWarnings().
 */
export type ClientImpact = {
  /** Every document, draft or issued. */
  documents: number
  /** Of those, the ones carrying an allocated serial number. */
  issuedDocuments: number
  /** Payment receipts recorded against those documents. */
  payments: number
  /** Proposals written for this client. Removed with them (ON DELETE CASCADE). */
  proposals: number
  projects: number
  /** Tasks on this client or on one of their projects. */
  tasks: number
  deals: number
  contacts: number
  /** AMCs, domains, hosting - anything renewing for this client. */
  subscriptions: number
  tickets: number
  /** Logged calls, notes and stage moves. */
  activities: number
  /**
   * Expenses recorded against this client's projects. These are NOT deleted.
   */
  expenses: number
  /** Whether a portal account has been claimed by this client. */
  hasPortalAccount: boolean
}

export const EMPTY_IMPACT: ClientImpact = {
  documents: 0,
  issuedDocuments: 0,
  payments: 0,
  proposals: 0,
  projects: 0,
  tasks: 0,
  deals: 0,
  contacts: 0,
  subscriptions: 0,
  tickets: 0,
  activities: 0,
  expenses: 0,
  hasPortalAccount: false,
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * The lines listing what will be removed, longest-lived records first.
 *
 * Returns only the non-empty ones: a list padded with "0 tickets" reads as
 * noise and buries the line that matters. An empty array means nothing is
 * attached, and the caller says so in words instead.
 */
export function describeClientImpact(impact: ClientImpact): string[] {
  const lines: string[] = []

  if (impact.documents > 0) {
    // The issued count is called out inside the documents line rather than
    // given its own: they are the same rows, and listing both as siblings
    // would read as more records than there are.
    lines.push(
      impact.issuedDocuments > 0
        ? `${plural(impact.documents, "document")}, ${impact.issuedDocuments} of them issued`
        : plural(impact.documents, "document")
    )
  }
  if (impact.payments > 0) lines.push(plural(impact.payments, "payment receipt"))
  if (impact.proposals > 0) lines.push(plural(impact.proposals, "proposal"))
  if (impact.projects > 0) lines.push(plural(impact.projects, "project"))
  if (impact.tasks > 0) lines.push(plural(impact.tasks, "task"))
  if (impact.subscriptions > 0) lines.push(plural(impact.subscriptions, "renewal"))
  if (impact.tickets > 0) lines.push(plural(impact.tickets, "support ticket"))
  if (impact.deals > 0) lines.push(plural(impact.deals, "lead"))
  if (impact.contacts > 0) lines.push(plural(impact.contacts, "contact"))
  if (impact.activities > 0) {
    lines.push(plural(impact.activities, "logged activity", "logged activities"))
  }

  return lines
}

/**
 * The consequences worth saying out loud, beyond the row counts.
 *
 * Each of these is something an administrator could reasonably not expect,
 * and each one is a thing they cannot put back afterwards.
 */
export function clientDeletionWarnings(impact: ClientImpact): string[] {
  const warnings: string[] = []

  if (impact.issuedDocuments > 0) {
    // The product's own rule everywhere else is that an issued document is
    // voided, never deleted, so its serial stays allocated and the series
    // stays gapless. Deleting the client overrides that, and the hole it
    // leaves in the invoice numbering is permanent.
    warnings.push(
      `${plural(impact.issuedDocuments, "issued document")} will be destroyed, leaving a permanent gap in your invoice numbering. Issued documents are normally voided instead.`
    )
  }

  if (impact.payments > 0) {
    warnings.push(
      `The payment ledger goes with them - ${plural(impact.payments, "receipt")} recorded against these documents.`
    )
  }

  if (impact.expenses > 0) {
    // Money the business spent is its own record, not the client's, so it
    // survives. expense-summary.ts already shows such a row as "Project
    // removed" and keeps it in the project-cost total, so reports still
    // account for every rupee.
    warnings.push(
      `${plural(impact.expenses, "expense")} recorded against these projects will be kept, shown as "Project removed" in reports.`
    )
  }

  if (impact.hasPortalAccount) {
    warnings.push(
      "Their portal stops working immediately. The sign-in account itself is left alone, as it may be attached to something else."
    )
  }

  return warnings
}

/** Whether anything at all hangs off this client. */
export function hasAttachedRecords(impact: ClientImpact): boolean {
  return describeClientImpact(impact).length > 0
}

/**
 * Whether the typed confirmation matches the client's code.
 *
 * The code rather than the name: it is short, it is shown on screen next to
 * the field, and it is unique within the workspace, so typing it cannot be
 * satisfied by a near-miss on a name two clients share. Case and surrounding
 * space are forgiven - this is a speed bump to make the action deliberate,
 * not a password.
 */
export function confirmationMatches(typed: string, code: string): boolean {
  const expected = code.trim().toUpperCase()
  if (!expected) return false
  return typed.trim().toUpperCase() === expected
}
