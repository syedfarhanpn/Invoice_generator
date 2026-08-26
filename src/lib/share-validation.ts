import { z } from "zod"

// Validation for the anonymous share surface. Kept out of the "use server"
// module so it can be unit-tested without pulling in the database client -
// these rules are a security boundary and must not silently drift.

/** 16 random bytes -> 22 base64url chars (src/lib/slug.ts). Bounded either side. */
export const publicSlugSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Malformed share link.")

/**
 * A drawn signature is a base64 PNG from a <canvas>. Without a cap this is an
 * unauthenticated route to write megabytes into a Json column.
 */
export const MAX_SIGNATURE_DATA_URL_CHARS = 300_000 // ~220KB of PNG

export const signContractSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("typed"),
    typedName: z.string().trim().min(1, "Type your full name to sign.").max(120),
    drawnDataUrl: z.undefined().optional(),
  }),
  z.object({
    method: z.literal("drawn"),
    typedName: z.string().optional(),
    drawnDataUrl: z
      .string()
      .startsWith("data:image/png;base64,", "Unsupported signature format.")
      .max(MAX_SIGNATURE_DATA_URL_CHARS, "Signature image is too large."),
  }),
])

export type SignContractInput = z.input<typeof signContractSchema>
