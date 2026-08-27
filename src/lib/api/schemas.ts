import { z } from "zod"

/**
 * Wire contract for the public API. Kept separate from the internal types so
 * that changing an internal field is not automatically a breaking API change.
 */

const trimmed = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    // Treat "" as "not provided" - CRMs commonly send empty strings for blanks.
    .transform((v) => (v === "" ? undefined : v))

export const clientCreateSchema = z.object({
  fullName: trimmed(200).min(1, "fullName is required."),
  email: z.string().trim().toLowerCase().email().max(320),
  businessName: optionalText(200),
  phone: optionalText(50),
  address: optionalText(500),
  country: optionalText(100),
  taxId: optionalText(50),
  notes: optionalText(2000),
  tags: z.array(trimmed(40)).max(25).optional(),
  defaultCurrency: trimmed(3).length(3).toUpperCase().optional(),
  /**
   * The serial code baked into every document number for this client. Omit it
   * and one is derived from the name. It cannot be changed once documents
   * exist, so a CRM should either always send it or never send it.
   */
  code: optionalText(12),
  /** Stable id in the source system. Makes a re-push an update, not a duplicate. */
  externalId: optionalText(128),
  sourceSystem: optionalText(64),
})

export const clientUpdateSchema = clientCreateSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "Provide at least one field to update." }
)

export const lineItemSchema = z.object({
  description: trimmed(500).min(1, "Each line item needs a description."),
  qty: z.number().finite().min(0).max(1_000_000),
  rate: z.number().finite().min(0).max(1_000_000_000),
})

export const documentCreateSchema = z.object({
  /** CONTRACT is not creatable over the API - it needs clause content and a signing flow. */
  type: z.enum(["INVOICE", "PROFORMA", "QUOTE"]),
  /** Either clientId or clientExternalId identifies the client; both are optional for a draft. */
  clientId: optionalText(64),
  clientExternalId: optionalText(128),
  title: optionalText(200),
  currency: trimmed(3).length(3).toUpperCase().optional(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  taxMode: z.enum(["NONE", "PERCENTAGE"]).optional(),
  taxRate: z.number().finite().min(0).max(100).optional(),
  taxLabel: optionalText(40),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required.").max(200),
  notes: optionalText(2000),
  externalId: optionalText(128),
  sourceSystem: optionalText(64),
})

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(64).optional(),
})

export type ClientCreateInput = z.infer<typeof clientCreateSchema>
export type DocumentCreateInput = z.infer<typeof documentCreateSchema>

/** Flattens zod issues into a stable, machine-readable shape. */
export function zodDetails(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((i) => ({ field: i.path.join(".") || "(root)", message: i.message }))
}
