'use server'

import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { emailSchema } from '@/lib/password'

// There is deliberately no signup action here. Accounts are provisioned by a
// super admin (see /dashboard/admin), and the corresponding Supabase user is
// created from the Supabase dashboard. Keeping account creation out of this
// file means no code path in the app can mint a Supabase user, so "Allow new
// users to sign up" in Supabase stays the single switch that controls it.
//
// If you later open self-service signup, turn that Supabase setting on AND
// set ALLOW_SELF_SIGNUP=true - both are required, on purpose.

function getSupabaseServerClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase variables')
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component - middleware refreshes the
          // session cookies instead, so this can be safely ignored.
        }
      },
    },
  })
}

export async function login(formData: FormData) {
  const cookieStore = await cookies()
  const supabase = getSupabaseServerClient(cookieStore)

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return redirect('/login?error=Could not authenticate user')
  }

  // Whether this account is provisioned, suspended, or a super admin is
  // decided in src/lib/current-user.ts on the first authenticated render. It
  // signs the session out and redirects back here with a reason, so there is
  // no second copy of that policy to keep in sync.

  redirect('/dashboard')
}

/**
 * Sends a password-reset email.
 *
 * Always reports success, whatever happened. Telling the visitor "no such
 * account" would turn this form into an oracle for discovering which
 * addresses are registered - so the only honest thing we can say is "if that
 * address has an account, a link is on its way".
 *
 * Supabase applies its own per-address and per-IP email rate limits, which is
 * what stops this being an outbound spam relay.
 */
export async function requestPasswordReset(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"))
  if (!parsed.success) {
    redirect("/login/forgot?error=" + encodeURIComponent("Enter a valid email address."))
  }

  const cookieStore = await cookies()
  const supabase = getSupabaseServerClient(cookieStore)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "")
  if (!siteUrl) {
    // Fail loudly in the server log: without this the email would link to
    // localhost and silently strand every real user.
    console.error("NEXT_PUBLIC_SITE_URL is not set - password reset links will be wrong.")
  }

  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl ?? ""}/auth/confirm`,
  })

  redirect("/login/forgot?sent=1")
}

export async function logout() {
  const cookieStore = await cookies()
  const supabase = getSupabaseServerClient(cookieStore)
  await supabase.auth.signOut()
  redirect('/login')
}
