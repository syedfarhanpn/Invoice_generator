import { z } from "zod"

/**
 * The rules for adding a company, kept pure so they can be tested without a
 * database. src/app/dashboard/admin/actions.ts applies them inside the
 * transaction that creates the company.
 */

/** Currencies offered when adding a company. The owner can change it later. */
export const COMPANY_CURRENCIES = ["INR", "USD", "AED", "GBP", "EUR", "SAR", "QAR", "AUD", "CAD", "SGD"] as const

export const newCompanySchema = z.object({
  companyName: z.string().trim().min(2, "Enter the company's name.").max(120, "That name is too long."),
  ownerName: z.string().trim().min(1, "Enter the owner's name.").max(120, "That name is too long."),
  ownerEmail: z.string().trim().toLowerCase().email("Enter a valid email address for the owner.").max(320),
  currency: z.enum(COMPANY_CURRENCIES).default("INR"),
})

export type NewCompany = z.infer<typeof newCompanySchema>

/** The first message a schema failure gives, written to be shown as-is. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the details and try again."
}

/**
 * A URL-safe handle from a company name: "Pixie Webs LLP" -> "pixie-webs-llp".
 * Falls back to "company" for a name made entirely of symbols.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
  return slug || "company"
}

/**
 * The slug, or the first numbered variant not already taken: "acme", then
 * "acme-2", "acme-3". Organisation.slug is unique, and two companies may
 * well share a name.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** What the would-be owner already is, as far as this rule cares. */
export type ProspectiveOwner = {
  isPlatformAdmin: boolean
  isSuspended: boolean
  /** Companies they already belong to, in any role or status. */
  companies: string[]
}

/**
 * Why this person cannot own a new company, or null when they can.
 *
 * One email, one company. A company's records are filed under its owner, and
 * signing in drops a person into the first company they belong to - so a
 * second membership would be a company they could never reach. And the
 * platform admin owns none: they look into companies, they are not one.
 */
export function ownershipRefusal(owner: ProspectiveOwner | null): string | null {
  if (!owner) return null
  if (owner.isPlatformAdmin) {
    return "That address is the platform admin's. The platform admin cannot own a company."
  }
  if (owner.companies.length > 0) {
    return `That address already belongs to ${owner.companies[0]}. Each person can be in one company only.`
  }
  // They would own a company they are refused entry to at sign-in.
  if (owner.isSuspended) {
    return "That account is suspended. Restore it under People first, then add the company."
  }
  return null
}
