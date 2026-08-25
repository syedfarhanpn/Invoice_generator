import crypto from "node:crypto"

// Deep, key-sorted JSON stringify so the same content always hashes the
// same way regardless of key insertion order.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

/**
 * SHA-256 of a JSON value, independent of key order. Used to freeze a
 * tamper-evident fingerprint of document content at finalize/sign time (see
 * Document.contentHash) - if the content is ever edited afterwards, the
 * recorded hash stops matching, which is the point.
 */
export function hashContent(content: unknown): string {
  const stable = JSON.stringify(sortKeysDeep(content))
  return crypto.createHash("sha256").update(stable).digest("hex")
}
