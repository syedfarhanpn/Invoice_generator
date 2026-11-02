/**
 * What the platform admin may still write while viewing a company.
 *
 * Viewing is read-only, and src/lib/db.ts enforces that on every query rather
 * than trusting each action to check: a write that slipped past a forgotten
 * permission check would change a tenant's real records, and they would have
 * no way of knowing who did it. So the database client refuses writes while
 * the viewing cookie is set, and this file is the short list of exceptions.
 *
 * Pure, so the list can be tested without a request or a database.
 */

/** Shown wherever a write is refused, so the reason is the same everywhere. */
export const VIEWING_READ_ONLY_MESSAGE =
  "You are viewing this company read-only. Exit viewing to make changes."

/**
 * Every operation that changes rows. Reads, including raw SELECTs that take
 * row locks, are not here: a lock inside a read is not a change, and refusing
 * them would break pages that only look.
 */
const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "$executeRaw",
  "$executeRawUnsafe",
])

export function isWriteOperation(operation: string): boolean {
  return WRITE_OPERATIONS.has(operation)
}

/**
 * The writes viewing may still make. Both are about the platform admin
 * themselves, never about the company being viewed:
 *
 *  - the audit row recording the visit, including the one written on the way
 *    out, while the cookie is still set;
 *  - their own last-sign-in time, which getCurrentUser() refreshes hourly.
 *    Only that one field, so this cannot become a way to write to the
 *    company owner's User row, which also carries the numbering sequences.
 */
export function allowedWhileViewing(model: string | undefined, operation: string, args: unknown): boolean {
  if (model === "AdminAuditLog" && operation === "create") return true

  if (model === "User" && operation === "update") {
    const data = (args as { data?: Record<string, unknown> } | null)?.data
    if (!data) return false
    const keys = Object.keys(data)
    return keys.length > 0 && keys.every((key) => key === "lastLoginAt")
  }

  return false
}
