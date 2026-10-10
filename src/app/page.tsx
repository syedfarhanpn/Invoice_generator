import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/utils/supabase/server"

/**
 * The root is a doorway: straight to the workspace with a session, straight to
 * sign-in without one. There is no landing page, because this is an
 * invite-only tool rather than something anyone arrives at cold.
 *
 * src/utils/supabase/middleware.ts normally makes this decision first, so this
 * rarely runs. It exists anyway so the behaviour is defined by the route and
 * not only by the proxy - and so `/` can never answer with a 404 if the proxy
 * is ever narrowed.
 */
export default async function Home() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  // Locally verified claims rather than getUser(): the signature check is the
  // same one the auth server would run, without the network round trip. See
  // the note in src/lib/current-user.ts.
  const { data } = await supabase.auth.getClaims()

  redirect(data?.claims ? "/dashboard" : "/login")
}
