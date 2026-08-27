import crypto from "node:crypto"

/**
 * API credentials for the public REST surface.
 *
 * Format: ck_live_<lookupId>_<secret>
 *
 * The lookupId is a public, indexed handle used to find the row in one hit;
 * the secret is what is actually verified. Splitting them means verification
 * never scans the table, and the UI can show a recognisable prefix without
 * revealing anything. The lookupId is hex rather than base64url because that
 * alphabet contains "_", which would make the separator ambiguous.
 *
 * The stored hash is a plain SHA-256, deliberately - not bcrypt/argon2. Those
 * exist to make LOW-entropy human passwords expensive to guess. This secret is
 * 192 bits of CSPRNG output, so brute force is already infeasible, and a slow
 * KDF would only add latency to every API request.
 */

const PREFIX = "ck_live_"
const LOOKUP_BYTES = 6 // 12 hex chars
const SECRET_BYTES = 24 // 32 base64url chars -> 192 bits

export type GeneratedApiKey = {
  /** Shown to the user exactly once. Never stored. */
  plaintext: string
  lookupId: string
  keyHash: string
}

export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex")
}

export function generateApiKey(): GeneratedApiKey {
  // Hex, not base64url: the base64url alphabet includes "_", which would
  // collide with the separator and make the key ambiguous to parse.
  const lookupId = crypto.randomBytes(LOOKUP_BYTES).toString("hex")
  const secret = crypto.randomBytes(SECRET_BYTES).toString("base64url")
  const plaintext = `${PREFIX}${lookupId}_${secret}`
  return { plaintext, lookupId, keyHash: hashApiKey(plaintext) }
}

/**
 * Pulls the lookupId out of a presented credential. Returns null for anything
 * malformed, so a caller never reaches the database with junk.
 */
export function parseApiKey(raw: string | null | undefined): { lookupId: string } | null {
  if (!raw || typeof raw !== "string") return null
  if (!raw.startsWith(PREFIX)) return null

  const body = raw.slice(PREFIX.length)
  const separator = body.indexOf("_")
  if (separator <= 0) return null

  const lookupId = body.slice(0, separator)
  const secret = body.slice(separator + 1)
  if (!/^[a-f0-9]{8,32}$/.test(lookupId)) return null
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(secret)) return null

  return { lookupId }
}

/** Constant-time comparison of two hex digests. */
export function verifyApiKey(plaintext: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiKey(plaintext), "hex")
  let expected: Buffer
  try {
    expected = Buffer.from(expectedHash, "hex")
  } catch {
    return false
  }
  // timingSafeEqual throws on a length mismatch, which would itself leak.
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

/** Non-secret display form for the UI, e.g. "ck_live_a1B2c3D4…". */
export function maskApiKey(lookupId: string): string {
  return `${PREFIX}${lookupId}…`
}

/** Extracts the bearer credential from an Authorization header. */
export function bearerFromHeader(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}
