import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import prisma from "@/lib/db"

// This app is single-admin: exactly one Supabase account (SUPER_ADMIN_EMAIL)
// may ever get a Prisma `User` row or touch app data. Signup is removed from
// the UI, but that alone doesn't stop the Supabase REST API from accepting
// registrations if "Allow new users to sign up" is still on in the dashboard
// - this check is the layer that survives that misconfiguration: it runs on
// every dashboard page and server action via getCurrentUser(), so a
// non-admin session never reaches a data query no matter how it authenticated.
// Memoized per request: this runs on every dashboard page and server action,
// and each call costs a Supabase round-trip plus a user upsert. React.cache
// scope is a single request, so a new request still re-validates the session
// - the single-admin check below is not weakened by this.
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data } = await supabase.auth.getUser()
  // Supabase treats addresses case-insensitively, so compare normalized -
  // a stray capital or trailing space in .env would otherwise lock the
  // admin out of their own app with a confusing "not authorized" error.
  const email = data.user?.email?.toLowerCase().trim()

  if (!email) {
    redirect("/login")
  }

  const allowedEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim()
  if (!allowedEmail) {
    // Fail closed: an unset allowlist must never mean "anyone gets in."
    throw new Error("SUPER_ADMIN_EMAIL is not set - refusing to authenticate anyone.")
  }

  if (email !== allowedEmail) {
    // Best-effort: cookies can only be cleared from a Route Handler, Server
    // Action, or proxy, so this may no-op when called from a Server
    // Component's render. The redirect below is what actually blocks access
    // - it fires before any data query runs, regardless of cookie state.
    await supabase.auth.signOut().catch(() => {})
    redirect("/login?error=This app is restricted to a single account.")
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  })

  return user
})
