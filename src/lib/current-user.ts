import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { User } from "@prisma/client"

import { createClient } from "@/utils/supabase/server"
import prisma from "@/lib/db"

// ---------------------------------------------------------------------------
// Authentication is Supabase's job. Authorization is ours, and it lives in the
// database (User.role / User.status) rather than an env var, so accounts can
// be managed at runtime by a super admin.
//
// SUPER_ADMIN_EMAIL is no longer the allowlist for access. It is now the
// bootstrap and break-glass path only: that one address is always (re)granted
// SUPER_ADMIN and ACTIVE on login, so you can never lock yourself out of your
// own product - not even by suspending your own account from the console.
//
// Provisioning is FAIL CLOSED. A Supabase account with no User row is refused
// unless it is the bootstrap address, or ALLOW_SELF_SIGNUP is explicitly
// turned on. An unset flag must never mean "anyone gets in".
// ---------------------------------------------------------------------------

/** Only update lastLoginAt this often, so it stays a cheap read on hot paths. */
const LAST_LOGIN_THROTTLE_MS = 60 * 60 * 1000

function bootstrapAdminEmail(): string | null {
  return process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim() || null
}

function selfSignupEnabled(): boolean {
  // Anything other than an explicit "true" is off.
  return process.env.ALLOW_SELF_SIGNUP?.toLowerCase().trim() === "true"
}

/**
 * Best-effort sign-out. Cookies can only be cleared from a Route Handler,
 * Server Action or proxy, so this may no-op inside a Server Component render.
 * The redirect that follows is what actually blocks access - it fires before
 * any data query runs, regardless of cookie state.
 */
async function rejectSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reason: string
): Promise<never> {
  await supabase.auth.signOut().catch(() => {})
  redirect(`/login?error=${encodeURIComponent(reason)}`)
}

/**
 * The authenticated, active account for this request. Every dashboard page and
 * server action funnels through here. Memoized per request: React.cache scope
 * is a single request, so a new request always re-validates the session.
 */
export const getCurrentUser = cache(async (): Promise<User> => {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data } = await supabase.auth.getUser()

  // Supabase treats addresses case-insensitively, so compare normalized - a
  // stray capital or trailing space would otherwise lock someone out of their
  // own account with a confusing "not authorized" error.
  const email = data.user?.email?.toLowerCase().trim()
  if (!email) redirect("/login")

  const bootstrapEmail = bootstrapAdminEmail()
  if (!bootstrapEmail) {
    // Fail closed: with no bootstrap address configured there is no way to
    // reach the admin console, so refuse rather than run un-administered.
    throw new Error("SUPER_ADMIN_EMAIL is not set - refusing to authenticate anyone.")
  }
  const isBootstrapAdmin = email === bootstrapEmail

  // Read first, create only if missing - this is a read on every hot path
  // rather than the upsert-per-request it used to be.
  let user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    if (!isBootstrapAdmin && !selfSignupEnabled()) {
      await rejectSession(
        supabase,
        "This account has not been given access. Ask an administrator to invite you."
      )
    }
    user = await prisma.user.create({
      data: {
        email,
        role: isBootstrapAdmin ? "SUPER_ADMIN" : "USER",
        lastLoginAt: new Date(),
      },
    })
  } else if (isBootstrapAdmin && (user.role !== "SUPER_ADMIN" || user.status !== "ACTIVE")) {
    // Break glass: the bootstrap address is always restored. This is what
    // makes a mis-click in the admin console recoverable.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "SUPER_ADMIN", status: "ACTIVE", suspendedAt: null, lastLoginAt: new Date() },
    })
  }

  if (user.status === "SUSPENDED") {
    await rejectSession(supabase, "This account has been suspended.")
  }

  // Throttled so this stays a read on the common path.
  const lastLogin = user.lastLoginAt?.getTime() ?? 0
  if (Date.now() - lastLogin > LAST_LOGIN_THROTTLE_MS) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
  }

  return user
})

/** True for the product operator, not for a tenant. */
export function isSuperAdmin(user: Pick<User, "role">): boolean {
  return user.role === "SUPER_ADMIN"
}

/**
 * Gate for the admin console and every admin server action. Redirects rather
 * than throwing, so a tenant who guesses /dashboard/admin simply lands back on
 * their own dashboard and learns nothing about what exists.
 */
export async function requireSuperAdmin(): Promise<User> {
  const user = await getCurrentUser()
  if (!isSuperAdmin(user)) redirect("/dashboard")
  return user
}
