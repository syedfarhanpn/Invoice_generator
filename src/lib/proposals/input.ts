import { z } from "zod"

/**
 * What the operator fills in to get a proposal written.
 *
 * Deliberately short. The only things a proposal cannot be written without
 * are who it is for and what the project is - a client name and phone, and a
 * description. Everything else (price, timeline, platforms, payment terms)
 * is optional: left blank, Claude proposes something sensible for the parts
 * that are words, and the parts that are money print as "to be confirmed"
 * rather than as a number nobody chose.
 */

export const DEFAULT_VALIDITY_DAYS = 30
export const DEFAULT_WARRANTY_DAYS = 30
export const MAX_DESCRIPTION_LENGTH = 8000

/** Trimmed, and absent rather than "" when empty. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)
}

function wholeDays(min: number, max: number) {
  return z.number().int().min(min).max(max).nullable()
}

export const proposalBriefSchema = z.object({
  projectName: optionalText(80),
  description: z
    .string()
    .trim()
    .min(20, "Describe the project in a sentence or two - Claude writes the proposal from it.")
    .max(MAX_DESCRIPTION_LENGTH),
  /** The price. Null prints as "to be confirmed" - never as zero. */
  value: z.number().positive().max(10_000_000_000).nullable(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Pick a currency"),
  developmentDays: wholeDays(1, 730),
  testingDays: wholeDays(0, 365),
  warrantyDays: wholeDays(0, 730),
  validityDays: z.number().int().min(1).max(365),
  platforms: optionalText(120),
  paymentTerms: optionalText(300),
  instructions: optionalText(2000),
  /** Printed after the owner's name on the cover, e.g. "CEO". */
  signatoryTitle: optionalText(60),
})

export type ProposalBrief = z.infer<typeof proposalBriefSchema>

/**
 * A client created from the proposal form. Name and phone are the floor; an
 * email is welcome but not required, because the proposal often goes out on
 * WhatsApp before anyone has asked for one.
 */
export const newProposalClientSchema = z.object({
  fullName: z.string().trim().min(1, "Client name is required").max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value.replace(/\D/g, "").length >= 6, "Phone number is required"),
  businessName: optionalText(160),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: "That email address does not look right",
    }),
  address: optionalText(300),
  country: optionalText(80),
  /** Optional - suggested from the name when left blank. */
  code: optionalText(12),
})

export type NewProposalClient = z.infer<typeof newProposalClientSchema>

export const proposalClientChoiceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), clientId: z.string().min(1).max(64) }),
  z.object({ mode: z.literal("new"), client: newProposalClientSchema }),
])

export type ProposalClientChoice = z.infer<typeof proposalClientChoiceSchema>

/** The first zod message, phrased for a person rather than a developer. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Some details are missing"
}
