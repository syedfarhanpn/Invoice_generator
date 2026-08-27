import { describe, expect, it } from "vitest"

import {
  bearerFromHeader,
  generateApiKey,
  hashApiKey,
  maskApiKey,
  parseApiKey,
  verifyApiKey,
} from "./api-key"

describe("generateApiKey", () => {
  it("produces a prefixed, parseable credential", () => {
    const { plaintext, lookupId } = generateApiKey()
    expect(plaintext.startsWith("ck_live_")).toBe(true)
    expect(parseApiKey(plaintext)?.lookupId).toBe(lookupId)
  })

  it("never returns the same key twice", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateApiKey().plaintext))
    expect(keys.size).toBe(1000)
  })

  it("does not store the plaintext in the hash form", () => {
    const { plaintext, keyHash } = generateApiKey()
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/)
    expect(keyHash).not.toContain(plaintext)
  })

  it("carries enough entropy to make guessing infeasible", () => {
    // 24 random bytes -> 32 base64url chars of secret
    const { plaintext, lookupId } = generateApiKey()
    const secret = plaintext.slice(`ck_live_${lookupId}_`.length)
    expect(secret.length).toBeGreaterThanOrEqual(32)
  })
})

describe("verifyApiKey", () => {
  it("accepts the matching secret", () => {
    const { plaintext, keyHash } = generateApiKey()
    expect(verifyApiKey(plaintext, keyHash)).toBe(true)
  })

  it("rejects a different secret with the same lookupId", () => {
    // The lookupId is public, so this is the attack that matters: it must not
    // be enough on its own to authenticate.
    const a = generateApiKey()
    const forged = `ck_live_${a.lookupId}_${"A".repeat(32)}`
    expect(verifyApiKey(forged, a.keyHash)).toBe(false)
  })

  it("rejects a truncated or padded secret", () => {
    const { plaintext, keyHash } = generateApiKey()
    expect(verifyApiKey(plaintext.slice(0, -1), keyHash)).toBe(false)
    expect(verifyApiKey(plaintext + "x", keyHash)).toBe(false)
  })

  it("returns false rather than throwing on a malformed stored hash", () => {
    const { plaintext } = generateApiKey()
    for (const bad of ["", "zzzz", "abc"]) {
      expect(verifyApiKey(plaintext, bad)).toBe(false)
    }
  })
})

describe("parseApiKey", () => {
  it("rejects anything without the prefix", () => {
    for (const bad of ["", "abc", "Bearer x", "sk_live_aaaa_bbbb", "ck_test_aaaa_bbbb"]) {
      expect(parseApiKey(bad)).toBeNull()
    }
  })

  it("rejects a key with no separator or an empty lookupId", () => {
    expect(parseApiKey("ck_live_nolookupseparator")).toBeNull()
    expect(parseApiKey("ck_live__secretonly")).toBeNull()
  })

  it("rejects non-strings and nullish input", () => {
    for (const bad of [null, undefined, 42 as unknown as string, {} as unknown as string]) {
      expect(parseApiKey(bad)).toBeNull()
    }
  })

  it("rejects injection-shaped characters in the lookupId", () => {
    // The lookupId reaches a database query, so it is charset-bounded.
    for (const bad of ["ck_live_a'b_cccccccccccccccc", "ck_live_a%20b_cccccccccccccccc", "ck_live_../.._cccccccccccccccc"]) {
      expect(parseApiKey(bad)).toBeNull()
    }
  })

  it("rejects a secret that is too short to be real", () => {
    expect(parseApiKey("ck_live_abcdefgh_short")).toBeNull()
  })
})

describe("bearerFromHeader", () => {
  it("extracts the credential", () => {
    expect(bearerFromHeader("Bearer ck_live_abc_def")).toBe("ck_live_abc_def")
    expect(bearerFromHeader("bearer ck_live_abc_def")).toBe("ck_live_abc_def")
  })

  it("returns null for a missing or malformed header", () => {
    for (const bad of [null, "", "Basic abc", "Bearer", "Bearer a b"]) {
      expect(bearerFromHeader(bad)).toBeNull()
    }
  })
})

describe("maskApiKey", () => {
  it("shows the public lookup handle and nothing else", () => {
    const { plaintext, lookupId } = generateApiKey()
    const masked = maskApiKey(lookupId)
    expect(masked).toContain(lookupId)
    expect(plaintext.includes(masked.replace("…", ""))).toBe(true)
    // the secret half must never appear
    const secret = plaintext.slice(`ck_live_${lookupId}_`.length)
    expect(masked).not.toContain(secret)
  })
})

describe("hashApiKey", () => {
  it("is deterministic", () => {
    expect(hashApiKey("ck_live_a_b")).toBe(hashApiKey("ck_live_a_b"))
  })

  it("differs for a one-character change", () => {
    expect(hashApiKey("ck_live_a_b")).not.toBe(hashApiKey("ck_live_a_c"))
  })
})
