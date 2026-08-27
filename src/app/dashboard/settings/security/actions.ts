"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/current-user"
import { changePasswordSchema, firstIssue } from "@/lib/password"
import { createClient } from "@/utils/supabase/server"

const PAGE = "/dashboard/settings/security"

/**
 * Changes the password for the signed-in user.
 *
 * Unlike the reset flow, this re-verifies the CURRENT password first.
 * Supabase would happily update the password from the session alone, but that
 * means an unattended logged-in browser is enough to lock the real owner out
 * of their account. Proving knowledge of the existing password closes that.
 */
export async function changePassword(formData: FormData) {
  const user = await getCurrentUser()

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    redirect(`${PAGE}?error=${encodeURIComponent(firstIssue(parsed.error))}`)
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  // Re-authenticate. A failure here is always "current password is wrong" -
  // the account plainly exists, so there is nothing to leak.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  })
  if (reauthError) {
    redirect(`${PAGE}?error=${encodeURIComponent("That is not your current password.")}`)
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    redirect(`${PAGE}?error=${encodeURIComponent(error.message)}`)
  }

  redirect(`${PAGE}?updated=1`)
}
