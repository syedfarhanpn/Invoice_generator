import { describe, expect, it } from "vitest"

import {
  MAX_SIGNATURE_DATA_URL_CHARS,
  publicSlugSchema,
  signContractSchema,
} from "./share-validation"

// This is the anonymous attack surface: anyone on the internet holding a
// share link reaches these schemas. Loosening one is a security change, so
// each rule is pinned here deliberately.

describe("publicSlugSchema", () => {
  it("accepts a real generated slug", () => {
    // 16 random bytes -> 22 base64url chars
    expect(publicSlugSchema.safeParse("A1b2C3d4E5f6G7h8I9j0Kl").success).toBe(true)
  })

  it("rejects anything with path or wildcard characters", () => {
    for (const bad of ["../../etc/passwd", "abc/def/ghi/jkl/mno", "slug with spaces!!", "a%2Fb%2Fc%2Fd%2Fe%2Ff"]) {
      expect(publicSlugSchema.safeParse(bad).success).toBe(false)
    }
  })

  it("rejects a slug that is too short to be unguessable", () => {
    expect(publicSlugSchema.safeParse("abc123").success).toBe(false)
  })

  it("rejects an over-long slug", () => {
    expect(publicSlugSchema.safeParse("a".repeat(65)).success).toBe(false)
  })

  it("rejects non-strings", () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(publicSlugSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe("signContractSchema", () => {
  const png = "data:image/png;base64,iVBORw0KGgo="

  it("accepts a typed signature with a name", () => {
    expect(signContractSchema.safeParse({ method: "typed", typedName: "Ada Lovelace" }).success).toBe(true)
  })

  it("rejects a typed signature with a blank or whitespace-only name", () => {
    expect(signContractSchema.safeParse({ method: "typed", typedName: "" }).success).toBe(false)
    expect(signContractSchema.safeParse({ method: "typed", typedName: "   " }).success).toBe(false)
  })

  it("rejects an absurdly long typed name", () => {
    expect(signContractSchema.safeParse({ method: "typed", typedName: "a".repeat(121) }).success).toBe(false)
  })

  it("accepts a drawn PNG signature", () => {
    expect(signContractSchema.safeParse({ method: "drawn", drawnDataUrl: png }).success).toBe(true)
  })

  it("rejects a drawn signature that is missing entirely", () => {
    expect(signContractSchema.safeParse({ method: "drawn" }).success).toBe(false)
    expect(signContractSchema.safeParse({ method: "drawn", drawnDataUrl: undefined }).success).toBe(false)
  })

  it("rejects a non-image payload smuggled through drawnDataUrl", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;base64,PHN2Zz4=", // SVG can carry script
      "https://example.com/sig.png",
    ]) {
      expect(signContractSchema.safeParse({ method: "drawn", drawnDataUrl: bad }).success).toBe(false)
    }
  })

  it("rejects an oversized signature image", () => {
    const huge = "data:image/png;base64," + "A".repeat(MAX_SIGNATURE_DATA_URL_CHARS)
    expect(signContractSchema.safeParse({ method: "drawn", drawnDataUrl: huge }).success).toBe(false)
  })

  it("rejects an unknown signing method", () => {
    expect(signContractSchema.safeParse({ method: "wet-ink", typedName: "x" }).success).toBe(false)
    expect(signContractSchema.safeParse({}).success).toBe(false)
  })

  it("keeps the size cap meaningful", () => {
    // Guards against someone bumping the constant to something unbounded.
    expect(MAX_SIGNATURE_DATA_URL_CHARS).toBeLessThanOrEqual(1_000_000)
  })
})
