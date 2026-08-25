'use server'

import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Signup is intentionally not implemented anywhere in this app. This is a
// single-admin tool: only the account matching SUPER_ADMIN_EMAIL (checked in
// src/lib/current-user.ts) is ever allowed past the dashboard, and that
// account must already exist in Supabase (create it once from the Supabase
// dashboard, not from this app). Do not add a signup action back here -
// without it, there is no code path in this app that can create a new
// Supabase user, which is the point.

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

  // Reject here too, not just in getCurrentUser(), so a non-admin sees the
  // right error immediately instead of bouncing through /dashboard first.
  const adminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim()
  const signedInEmail = email.toLowerCase().trim()
  if (!adminEmail || signedInEmail !== adminEmail) {
    await supabase.auth.signOut()
    return redirect('/login?error=This account is not authorized')
  }

  redirect('/dashboard')
}

export async function logout() {
  const cookieStore = await cookies()
  const supabase = getSupabaseServerClient(cookieStore)
  await supabase.auth.signOut()
  redirect('/login')
}
