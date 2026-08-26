import { describe, expect, it } from "vitest"

import { hashContent } from "./hash"
import { generatePublicSlug } from "./slug"

describe("hashContent", () => {
  it("is independent of key insertion order", () => {
    // The signature records this hash as proof of "I agreed to exactly this
    // text". If key order changed the hash, every signature would break.
    expect(hashContent({ a: 1, b: { c: 2, d: 3 } })).toBe(hashContent({ b: { d: 3, c: 2 }, a: 1 }))
  })

  it("changes when any content changes", () => {
    const base = hashContent({ lineItems: [{ description: "Design", qty: 1, rate: 500 }] })
    const tampered = hashContent({ lineItems: [{ description: "Design", qty: 1, rate: 5000 }] })
    expect(tampered).not.toBe(base)
  })

  it("preserves array order (which is meaningful for line items)", () => {
    expect(hashContent([1, 2])).not.toBe(hashContent([2, 1]))
  })

  it("returns a hex sha256", () => {
    expect(hashContent({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("generatePublicSlug", () => {
  it("produces url-safe tokens of stable length", () => {
    for (let i = 0; i < 50; i++) expect(generatePublicSlug()).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 2000 }, generatePublicSlug))
    expect(seen.size).toBe(2000)
  })
})
