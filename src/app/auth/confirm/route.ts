import { type EmailOtpType } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/utils/supabase/server"

/**
 * Landing point for every Supabase auth email: password recovery AND the
 * "Invite user" button in the Supabase dashboard.
 *
 * Handles both link styles so it works whichever email template is in use:
 *
 *  - `?token_hash=...&type=recovery|invite|signup` - the server-side style,
 *    verified here with verifyOtp(). This is the one to prefer: the secret
 *    never reaches the browser as a URL fragment.
 *  - `?code=...` - the PKCE style, exchanged for a session.
 *
 * On success the visitor holds a real session and is sent to set a password.
 * On failure they land on /login with a generic message - never an error from
 * the auth provider, which would leak whether an address is registered.
 */
const ALLOWED_TYPES: EmailOtpType[] = ["recovery", "invite", "signup", "email_change", "magiclink"]

function failure(request: NextRequest, reason: string) {
  const url = request.nextUrl.clone()
  url.pathname = "/login"
  url.search = ""
  url.searchParams.set("error", reason)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const tokenHash = params.get("token_hash")
  const type = params.get("type") as EmailOtpType | null
  const code = params.get("code")

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return failure(request, "That link has expired. Request a new one.")
  } else if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) return failure(request, "That link has expired or was already used. Request a new one.")
  } else {
    return failure(request, "That link is not valid. Request a new one.")
  }

  const url = request.nextUrl.clone()
  url.pathname = "/auth/set-password"
  url.search = ""
  // Tells the page whether to say "set" or "reset", nothing security-relevant.
  if (type === "invite" || type === "signup") url.searchParams.set("welcome", "1")
  return NextResponse.redirect(url)
}
