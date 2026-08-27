import { describe, expect, it } from "vitest"

import {
  isOwnLogoUrl,
  LOGO_MAX_BYTES,
  logoExtension,
  logoObjectPath,
  validateLogo,
} from "./logo-upload"

const SUPABASE = "https://abcdefgh.supabase.co"
const ME = "11111111-1111-1111-1111-111111111111"
const SOMEONE_ELSE = "22222222-2222-2222-2222-222222222222"
const mine = (file = "logo-1.png") =>
  `${SUPABASE}/storage/v1/object/public/business-logos/${ME}/${file}`

describe("validateLogo", () => {
  it("accepts the supported image types", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateLogo({ type, size: 1000 })).toBeNull()
    }
  })

  it("rejects SVG", () => {
    // The bucket is public-read, and an SVG can carry script.
    expect(validateLogo({ type: "image/svg+xml", size: 1000 })).toBeTruthy()
  })

  it("rejects non-images", () => {
    for (const type of ["application/pdf", "text/html", "application/octet-stream", ""]) {
      expect(validateLogo({ type, size: 1000 })).toBeTruthy()
    }
  })

  it("rejects an empty file", () => {
    expect(validateLogo({ type: "image/png", size: 0 })).toBeTruthy()
  })

  it("accepts a file at exactly the limit and rejects one byte more", () => {
    expect(validateLogo({ type: "image/png", size: LOGO_MAX_BYTES })).toBeNull()
    expect(validateLogo({ type: "image/png", size: LOGO_MAX_BYTES + 1 })).toBeTruthy()
  })
})

describe("logoObjectPath", () => {
  it("puts the owner id first, which is the RLS boundary", () => {
    const path = logoObjectPath(ME, "image/png")
    expect(path).not.toBeNull()
    expect(path!.split("/")[0]).toBe(ME)
    expect(path!.endsWith(".png")).toBe(true)
  })

  it("returns null for a type it cannot name", () => {
    expect(logoObjectPath(ME, "image/svg+xml")).toBeNull()
  })

  it("produces a fresh name so a replacement is never served from cache", async () => {
    const a = logoObjectPath(ME, "image/png")
    await new Promise((r) => setTimeout(r, 2))
    expect(logoObjectPath(ME, "image/png")).not.toBe(a)
  })
})

describe("logoExtension", () => {
  it("maps supported types and refuses others", () => {
    expect(logoExtension("image/jpeg")).toBe("jpg")
    expect(logoExtension("image/gif")).toBeNull()
  })
})

// The browser performs the upload, so the URL handed back to the server is
// attacker-controlled. These are the checks that stop it pointing anywhere else.
describe("isOwnLogoUrl", () => {
  it("accepts this tenant's own object", () => {
    expect(isOwnLogoUrl(mine(), SUPABASE, ME)).toBe(true)
  })

  it("rejects another tenant's folder", () => {
    const theirs = `${SUPABASE}/storage/v1/object/public/business-logos/${SOMEONE_ELSE}/logo-1.png`
    expect(isOwnLogoUrl(theirs, SUPABASE, ME)).toBe(false)
  })

  it("rejects a different host", () => {
    expect(
      isOwnLogoUrl(`https://evil.example.com/storage/v1/object/public/business-logos/${ME}/x.png`, SUPABASE, ME)
    ).toBe(false)
  })

  it("rejects a different bucket", () => {
    expect(
      isOwnLogoUrl(`${SUPABASE}/storage/v1/object/public/private-docs/${ME}/x.png`, SUPABASE, ME)
    ).toBe(false)
  })

  it("rejects path traversal out of the folder", () => {
    expect(isOwnLogoUrl(mine("../../etc/passwd"), SUPABASE, ME)).toBe(false)
    expect(isOwnLogoUrl(mine(".."), SUPABASE, ME)).toBe(false)
  })

  it("rejects nesting below the owner folder", () => {
    expect(isOwnLogoUrl(mine("sub/logo.png"), SUPABASE, ME)).toBe(false)
  })

  it("rejects an empty object name", () => {
    expect(isOwnLogoUrl(mine(""), SUPABASE, ME)).toBe(false)
  })

  it("rejects a prefix-matching impostor id", () => {
    // "111..." must not satisfy a check for "1111..."
    expect(isOwnLogoUrl(mine(), SUPABASE, "1111")).toBe(false)
  })

  it("tolerates a trailing slash on the configured Supabase URL", () => {
    expect(isOwnLogoUrl(mine(), `${SUPABASE}/`, ME)).toBe(true)
  })

  it("rejects non-storage URLs on the right host", () => {
    expect(isOwnLogoUrl(`${SUPABASE}/anything/${ME}/x.png`, SUPABASE, ME)).toBe(false)
  })
})
