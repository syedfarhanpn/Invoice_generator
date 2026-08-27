"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { firstIssue, newPasswordSchema } from "@/lib/password"
import { createClient } from "@/utils/supabase/server"

/**
 * Sets a password for whoever holds the session created by /auth/confirm -
 * i.e. someone who just proved control of the mailbox via a recovery or
 * invite link. The session IS the authorisation here; there is no old
 * password to check, because in the invite case there never was one.
 */
export async function setNewPassword(formData: FormData) {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    redirect(`/auth/set-password?error=${encodeURIComponent(firstIssue(parsed.error))}`)
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  // Re-check the session server-side rather than trusting the page render:
  // this action is a public endpoint and must stand on its own.
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    redirect("/login/forgot?error=" + encodeURIComponent("That link has expired. Request a new one."))
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    redirect(`/auth/set-password?error=${encodeURIComponent(error.message)}`)
  }

  redirect("/dashboard")
}
