import { cookies } from "next/headers"

/**
 * The platform admin looking at a company, read-only.
 *
 * A cookie rather than a URL parameter, so every page and every request in
 * the browser tab sees the same company without each link carrying it. It
 * only ever says WHICH company: whether its holder may look is decided again
 * on every request in src/lib/access.ts, which honours it for a super admin
 * and nobody else. A tenant who forged one would gain nothing - and since the
 * database client refuses writes whenever it is present, they would only
 * stop themselves saving.
 *
 * Set and cleared by the actions in src/app/dashboard/admin/actions.ts, and
 * cleared at every sign-in and sign-out so it can never outlive the session
 * of the person who set it.
 */
export const VIEWING_COOKIE = "pw_viewing_company"

/** A long working session, then it lapses on its own. */
const VIEWING_MAX_AGE_SECONDS = 8 * 60 * 60

export const VIEWING_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: VIEWING_MAX_AGE_SECONDS,
} as const

/**
 * The company being viewed, or null.
 *
 * Never throws. Outside a request - a script, a test, a build step - there
 * are no cookies to read, and that simply means nobody is viewing anything.
 */
export async function viewingOrgId(): Promise<string | null> {
  try {
    return (await cookies()).get(VIEWING_COOKIE)?.value || null
  } catch {
    return null
  }
}
