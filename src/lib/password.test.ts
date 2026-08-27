import { describe, expect, it } from "vitest"

import {
  changePasswordSchema,
  emailSchema,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  newPasswordSchema,
  passwordSchema,
} from "./password"

// These rules gate every way a password can be set: the reset link, the
// invite link, and the change-password form. Loosening one loosens all three.

const ok = "correct-horse-battery"

describe("passwordSchema", () => {
  it("accepts a password at the minimum length", () => {
    expect(passwordSchema.safeParse("a".repeat(MIN_PASSWORD_LENGTH)).success).toBe(true)
  })

  it("rejects one character short", () => {
    expect(passwordSchema.safeParse("a".repeat(MIN_PASSWORD_LENGTH - 1)).success).toBe(false)
  })

  it("rejects an empty password", () => {
    expect(passwordSchema.safeParse("").success).toBe(false)
  })

  it("rejects an absurdly long password", () => {
    expect(passwordSchema.safeParse("a".repeat(MAX_PASSWORD_LENGTH + 1)).success).toBe(false)
  })

  it("does not impose composition rules", () => {
    // Deliberate: a long passphrase must pass without symbols or digits.
    expect(passwordSchema.safeParse("correct horse battery staple").success).toBe(true)
  })

  it("rejects non-strings", () => {
    for (const bad of [null, undefined, 12345678901, {}]) {
      expect(passwordSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe("newPasswordSchema", () => {
  it("accepts matching passwords", () => {
    expect(newPasswordSchema.safeParse({ password: ok, confirmPassword: ok }).success).toBe(true)
  })

  it("rejects a mismatched confirmation", () => {
    const r = newPasswordSchema.safeParse({ password: ok, confirmPassword: ok + "x" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/match/i)
  })

  it("rejects a too-short password even when both fields agree", () => {
    expect(newPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).success).toBe(false)
  })
})

describe("changePasswordSchema", () => {
  it("accepts a valid change", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "old-password-here",
        password: ok,
        confirmPassword: ok,
      }).success
    ).toBe(true)
  })

  it("requires the current password", () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: "", password: ok, confirmPassword: ok }).success
    ).toBe(false)
  })

  it("rejects reusing the current password", () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: ok,
      password: ok,
      confirmPassword: ok,
    })
    expect(r.success).toBe(false)
  })
})

describe("emailSchema", () => {
  it("normalises case and surrounding whitespace", () => {
    // Supabase treats addresses case-insensitively; matching that here keeps
    // a reset request for "Me@X.com" pointed at the same account as "me@x.com".
    const r = emailSchema.safeParse("  Me@Example.COM ")
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toBe("me@example.com")
  })

  it("rejects malformed addresses", () => {
    for (const bad of ["", "not-an-email", "a@", "@b.com", "a b@c.com"]) {
      expect(emailSchema.safeParse(bad).success).toBe(false)
    }
  })

  it("rejects an over-long address", () => {
    expect(emailSchema.safeParse("a".repeat(320) + "@example.com").success).toBe(false)
  })
})
