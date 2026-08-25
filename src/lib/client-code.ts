// A client's serial code (the "ACME" in INV-ACME-001) is auto-suggested from
// their business name here, but stays editable until their first document
// is finalized - see the lock check in the client edit action.

function baseCode(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  return cleaned.slice(0, 4) || "CLNT"
}

export function normalizeClientCode(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12)
}

/**
 * Finds a free code for a new client, starting from the business/full name
 * and appending a numeric suffix on collision (ACME, ACME2, ACME3, ...).
 * `isTaken` should check uniqueness scoped to the current user.
 */
export async function suggestClientCode(
  name: string,
  isTaken: (code: string) => Promise<boolean>
): Promise<string> {
  const base = baseCode(name)
  if (!(await isTaken(base))) return base

  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`
    if (!(await isTaken(candidate))) return candidate
  }

  // Practically unreachable (99 clients with the same 4-letter prefix), but
  // guarantees a return value instead of an infinite loop.
  return `${base}${Date.now().toString().slice(-4)}`
}
