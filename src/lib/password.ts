import { z } from "zod"

/**
 * Password rules, kept pure so they can be unit-tested and so the same limits
 * apply to every entry point (reset, invite, change).
 *
 * Length only, no composition rules. Current NIST guidance (SP 800-63B) is
 * that forced symbol/digit mixes push people toward predictable patterns; a
 * longer minimum is worth more. Supabase's own floor is 6, so this is the
 * binding constraint.
 */
export const MIN_PASSWORD_LENGTH = 10

/** Upper bound purely to stop a megabyte of text reaching the auth provider. */
export const MAX_PASSWORD_LENGTH = 200

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, "That password is too long.")

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(320) // RFC 5321 maximum
  .email("Enter a valid email address.")

/** New-password form: the two fields must agree before anything is submitted. */
export const newPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  })

/** Change-password form: current password proves the session belongs to them. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  })
  .refine((v) => v.password !== v.currentPassword, {
    message: "Choose a password you have not used here before.",
    path: ["password"],
  })

/** First error message from a failed parse, for surfacing in the UI. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That input could not be accepted."
}
