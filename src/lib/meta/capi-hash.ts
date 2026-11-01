import { createHash } from "node:crypto"

/**
 * Normalising and hashing customer data for Meta's Conversions API.
 *
 * Meta matches an event to a person by comparing SHA-256 hashes, so the
 * normalisation has to be byte-identical to theirs or the hash differs and
 * the match silently fails - no error, just a lead that never gets
 * attributed. That is why this is a module of its own with tests rather than
 * a few inline .toLowerCase() calls: a wrong hash looks exactly like a
 * correct one.
 *
 * Rules are Meta's, from the customer information parameters reference:
 *
 *   em       trim, lowercase
 *   ph       digits only, leading zeros removed, country code included
 *   fn / ln  lowercase, no punctuation
 *   ct       lowercase, no punctuation, no spaces
 *   st       lowercase, 2-letter ANSI in the US, otherwise letters only
 *   zp       lowercase, no spaces or dashes, first 5 digits in the US
 *   country  lowercase ISO 3166-1 alpha-2
 *
 * Nothing here ever sends a value unhashed. lead_id, fbc and fbp are the
 * exceptions Meta defines and they are handled in capi-event.ts, not here,
 * so there is no path through this file that leaks a plain email address.
 */

/** SHA-256, lowercase hex - the only digest Meta accepts. */
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/**
 * Hashes a normalised value, or returns null for an empty one.
 *
 * Null rather than the hash of an empty string, which is a real and constant
 * digest: sending it would claim every lead shares an email address and is
 * worse than sending nothing.
 */
function hashOrNull(normalised: string): string | null {
  return normalised ? sha256(normalised) : null
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

/**
 * Digits only, with the country code on the front.
 *
 * `defaultCountryCode` is applied when the number carries none - an Indian
 * ten-digit mobile typed as "98765 43210" has to go out as "919876543210",
 * because a number without a country code matches nothing.
 *
 * Leading zeros go first (India's trunk prefix, the UK's 0), then the code is
 * added only if what remains is too short to already contain one.
 */
export function normalizePhone(
  value: string | null | undefined,
  defaultCountryCode = "91"
): string {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "")
  if (!digits) return ""

  const code = defaultCountryCode.replace(/\D/g, "")
  if (!code) return digits
  // A national subscriber number is 10 digits almost everywhere this product
  // operates; anything longer already carries its own code.
  if (digits.length > 10) return digits
  return `${code}${digits}`
}

/**
 * Lowercase, letters only. Used for names.
 *
 * Letters AND combining marks: in Malayalam, Hindi or Tamil the vowel signs
 * and the virama are marks, not letters, and stripping them turns "ശ്യാം"
 * into "ശയ" - a different string, so a different hash, so no match.
 */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}]/gu, "")
}

/** Lowercase, no punctuation or spaces. Marks kept, as for names. */
export function normalizeCity(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "")
}

export function normalizeState(value: string | null | undefined): string {
  return normalizeCity(value)
}

/**
 * Lowercase, no spaces or dashes. A US ZIP+4 is cut to its first five
 * digits, which is the only part Meta matches on.
 */
export function normalizeZip(value: string | null | undefined, country?: string | null): string {
  const cleaned = (value ?? "").trim().toLowerCase().replace(/[\s-]/g, "")
  if (!cleaned) return ""
  if (normalizeCountry(country) === "us") return cleaned.slice(0, 5)
  return cleaned
}

/**
 * Lowercase ISO 3166-1 alpha-2.
 *
 * A full country name is accepted and mapped for the handful this product
 * actually sees; anything else longer than two letters is dropped rather
 * than truncated, because "Ireland" cut to "ir" is Iran.
 */
const COUNTRY_NAMES: Record<string, string> = {
  india: "in",
  "united states": "us",
  "united states of america": "us",
  usa: "us",
  "united kingdom": "gb",
  uk: "gb",
  canada: "ca",
  australia: "au",
  singapore: "sg",
  "united arab emirates": "ae",
  uae: "ae",
}

export function normalizeCountry(value: string | null | undefined): string {
  const cleaned = (value ?? "").trim().toLowerCase().replace(/\./g, "")
  if (!cleaned) return ""
  if (cleaned.length === 2) return cleaned
  return COUNTRY_NAMES[cleaned] ?? ""
}

/** The hashed identifiers Meta matches on, under its own short key names. */
export type HashedUserData = {
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  ct?: string[]
  st?: string[]
  zp?: string[]
  country?: string[]
}

export type UserIdentity = {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  /** Applied to a phone number that carries no country code of its own. */
  defaultCountryCode?: string
}

/**
 * Builds the hashed half of `user_data`.
 *
 * Every value is an array because Meta accepts several per person - a lead
 * with two phone numbers matches on either. Absent fields are omitted
 * entirely rather than sent as null, which Meta rejects.
 */
export function hashUserData(identity: UserIdentity): HashedUserData {
  const code = identity.defaultCountryCode ?? "91"
  const country = normalizeCountry(identity.country)

  const fields: Array<[keyof HashedUserData, string | null]> = [
    ["em", hashOrNull(normalizeEmail(identity.email))],
    ["ph", hashOrNull(normalizePhone(identity.phone, code))],
    ["fn", hashOrNull(normalizeName(identity.firstName))],
    ["ln", hashOrNull(normalizeName(identity.lastName))],
    ["ct", hashOrNull(normalizeCity(identity.city))],
    ["st", hashOrNull(normalizeState(identity.state))],
    ["zp", hashOrNull(normalizeZip(identity.zip, identity.country))],
    ["country", hashOrNull(country)],
  ]

  const out: HashedUserData = {}
  for (const [key, hash] of fields) {
    if (hash) out[key] = [hash]
  }
  return out
}

/** Whether there is anything here Meta could match a person on. */
export function hasMatchableIdentity(hashed: HashedUserData): boolean {
  // Email and phone are the only two that identify somebody on their own. A
  // country and a first name match half the country.
  return (hashed.em?.length ?? 0) > 0 || (hashed.ph?.length ?? 0) > 0
}
