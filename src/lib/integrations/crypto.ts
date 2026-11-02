import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Encrypting a company's integration secrets before they are stored.
 *
 * A Meta access token or an Anthropic key, unlike this app's own API keys,
 * has to be read back - it is sent on the company's behalf - so it cannot
 * be hashed. It is encrypted instead, with AES-256-GCM under a key that
 * lives only in the server's environment:
 *
 *   INTEGRATIONS_SECRET_KEY   32 random bytes, base64. Generate with
 *     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * The same value must be set everywhere the app runs against this database,
 * or one deployment cannot read what the other saved. Losing it means every
 * company re-enters its keys; it does not expose them.
 *
 * Each ciphertext is bound to its company and provider (the "additional
 * authenticated data"), so copying one company's encrypted token into
 * another company's row produces something that will not decrypt, rather
 * than a working token in the wrong hands.
 */

const VERSION = "v1"
const IV_BYTES = 12

/** The key, or null when it is unset or not 32 bytes. */
export function integrationsKey(raw = process.env.INTEGRATIONS_SECRET_KEY): Buffer | null {
  const value = raw?.trim()
  if (!value) return null
  const key = Buffer.from(value, "base64")
  return key.length === 32 ? key : null
}

export function encryptionConfigured(): boolean {
  return integrationsKey() != null
}

/** What the secret is bound to: the company and the provider. */
export function secretContext(orgId: string, provider: string): string {
  return `${orgId}:${provider}`
}

export function encryptSecret(plain: string, context: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(Buffer.from(context, "utf8"))
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".")
}

/**
 * The secret, or null when it cannot be read: the wrong key, the wrong
 * company or provider, or a value that was altered. Never throws - a secret
 * that will not decrypt is treated as not connected, not as a crash.
 */
export function decryptSecret(stored: string, context: string, key: Buffer): string | null {
  const [version, iv, tag, ciphertext] = stored.split(".")
  if (version !== VERSION || !iv || !tag || ciphertext == null) return null
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"))
    decipher.setAAD(Buffer.from(context, "utf8"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

/** The last four characters, for "Connected · ending a3f9". */
export function secretHint(plain: string): string {
  return plain.trim().slice(-4)
}
