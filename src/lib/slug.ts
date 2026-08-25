import crypto from "node:crypto"

/**
 * A random, unguessable share-link token - independent of the document id
 * (unlike the old `id.slice(-8)` scheme, which leaked the dashboard id
 * straight into a public URL). 16 random bytes -> 22 base64url characters,
 * ~128 bits of entropy.
 */
export function generatePublicSlug(): string {
  return crypto.randomBytes(16).toString("base64url")
}
