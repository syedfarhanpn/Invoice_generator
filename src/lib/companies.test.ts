import { describe, expect, it } from "vitest"

import { newCompanySchema, ownershipRefusal, slugify, uniqueSlug } from "./companies"

describe("slugify", () => {
  it("turns a company name into a URL-safe handle", () => {
    expect(slugify("Pixie Webs LLP")).toBe("pixie-webs-llp")
    expect(slugify("  Artizo & Co.  ")).toBe("artizo-co")
  })

  it("drops accents rather than the letters they sit on", () => {
    expect(slugify("Café Société")).toBe("cafe-societe")
  })

  it("never returns an empty handle", () => {
    expect(slugify("!!!")).toBe("company")
    expect(slugify("ಕನ್ನಡ")).toBe("company")
  })

  it("keeps it short and does not end on a dash", () => {
    const slug = slugify("A very long company name that keeps going and going and going")
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith("-")).toBe(false)
  })
})

describe("uniqueSlug", () => {
  it("uses the handle as it is when it is free", () => {
    expect(uniqueSlug("acme", new Set())).toBe("acme")
  })

  it("numbers it when two companies share a name", () => {
    expect(uniqueSlug("acme", new Set(["acme"]))).toBe("acme-2")
    expect(uniqueSlug("acme", new Set(["acme", "acme-2", "acme-3"]))).toBe("acme-4")
  })
})

describe("ownershipRefusal", () => {
  const person = { isPlatformAdmin: false, isSuspended: false, companies: [] as string[] }

  it("lets someone new to the platform own a company", () => {
    expect(ownershipRefusal(null)).toBeNull()
    expect(ownershipRefusal(person)).toBeNull()
  })

  it("refuses the platform admin", () => {
    expect(ownershipRefusal({ ...person, isPlatformAdmin: true })).toMatch(/platform admin/)
  })

  it("refuses someone already in another company, and names it", () => {
    expect(ownershipRefusal({ ...person, companies: ["Pixie Webs"] })).toMatch(/Pixie Webs/)
  })

  it("refuses a suspended account, who could not sign in to it", () => {
    expect(ownershipRefusal({ ...person, isSuspended: true })).toMatch(/suspended/)
  })
})

describe("newCompanySchema", () => {
  it("accepts a company with an owner, and normalises the address", () => {
    const parsed = newCompanySchema.parse({
      companyName: " Artizo ",
      ownerName: "Adnan",
      ownerEmail: " Adnan@Artizo.COM ",
    })
    expect(parsed).toEqual({ companyName: "Artizo", ownerName: "Adnan", ownerEmail: "adnan@artizo.com", currency: "INR" })
  })

  it("refuses a missing owner or a bad address", () => {
    expect(newCompanySchema.safeParse({ companyName: "Artizo", ownerName: "", ownerEmail: "a@b.co" }).success).toBe(false)
    expect(newCompanySchema.safeParse({ companyName: "Artizo", ownerName: "A", ownerEmail: "nope" }).success).toBe(false)
  })

  it("refuses a currency it does not offer", () => {
    const result = newCompanySchema.safeParse({ companyName: "Artizo", ownerName: "A", ownerEmail: "a@b.co", currency: "XYZ" })
    expect(result.success).toBe(false)
  })
})
