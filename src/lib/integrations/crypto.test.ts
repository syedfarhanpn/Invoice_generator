import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"

import { decryptSecret, encryptSecret, integrationsKey, secretContext, secretHint } from "./crypto"

const key = randomBytes(32)
const context = secretContext("org_1", "META_CAPI")

describe("integrationsKey", () => {
  it("reads 32 base64 bytes", () => {
    expect(integrationsKey(randomBytes(32).toString("base64"))?.length).toBe(32)
  })

  it("refuses a missing or wrongly sized key rather than using it", () => {
    expect(integrationsKey(undefined)).toBeNull()
    expect(integrationsKey("  ")).toBeNull()
    expect(integrationsKey(randomBytes(16).toString("base64"))).toBeNull()
  })
})

describe("encryptSecret / decryptSecret", () => {
  it("gives back what was stored", () => {
    const stored = encryptSecret("EAAB-token-123", context, key)
    expect(decryptSecret(stored, context, key)).toBe("EAAB-token-123")
  })

  it("never stores the secret in a readable form", () => {
    const stored = encryptSecret("sk-ant-api03-secret", context, key)
    expect(stored).not.toContain("sk-ant")
    expect(stored.startsWith("v1.")).toBe(true)
  })

  it("encrypts the same secret differently each time", () => {
    expect(encryptSecret("same", context, key)).not.toBe(encryptSecret("same", context, key))
  })

  it("will not decrypt under another key", () => {
    const stored = encryptSecret("token", context, key)
    expect(decryptSecret(stored, context, randomBytes(32))).toBeNull()
  })

  it("will not decrypt as another company's, so a copied row is useless", () => {
    const stored = encryptSecret("token", context, key)
    expect(decryptSecret(stored, secretContext("org_2", "META_CAPI"), key)).toBeNull()
    expect(decryptSecret(stored, secretContext("org_1", "ANTHROPIC"), key)).toBeNull()
  })

  it("refuses a value that was tampered with", () => {
    const [version, iv, tag, ciphertext] = encryptSecret("token", context, key).split(".")
    const flipped = Buffer.from(ciphertext, "base64")
    flipped[0] ^= 1
    expect(decryptSecret([version, iv, tag, flipped.toString("base64")].join("."), context, key)).toBeNull()
  })

  it("refuses something that is not one of ours", () => {
    expect(decryptSecret("plain-text-token", context, key)).toBeNull()
    expect(decryptSecret("v2.a.b.c", context, key)).toBeNull()
  })
})

describe("secretHint", () => {
  it("is the last four characters", () => {
    expect(secretHint("sk-ant-api03-abcdWXYZ")).toBe("WXYZ")
  })
})
