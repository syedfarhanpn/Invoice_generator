import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Paths that never carry a dashboard session: the public share pages a client
 * opens, and the REST surface, which authenticates with an API key rather than
 * cookies (see src/lib/api/auth.ts). Returning before the Supabase client is
 * built keeps a shared invoice link from paying for session handling it has no
 * use for.
 */
const SESSIONLESS_PREFIXES = ["/share", "/api/"]

export const updateSession = async (request: NextRequest) => {
  if (SESSIONLESS_PREFIXES.some((prefix) => request.nextUrl.pathname.startsWith(prefix))) {
    return NextResponse.next({ request })
  }

  // Create an unmodified response
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  // Refresh the session and establish who is calling. Do not remove this
  // call - it's what keeps Supabase's auth cookies valid across requests.
  //
  // getClaims() rather than getUser(): both start by loading (and refreshing)
  // the session from cookies, but getUser() then asks the auth server to
  // confirm it, which measured at 90-350ms of network on every single request
  // - and this runs on page loads, router prefetches and server actions alike.
  // getClaims() instead verifies the token's ES256 signature locally against
  // the project's public keys, fetched once and cached. Same guarantee that
  // the token is genuine and unexpired, without the round trip.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims ?? null

  // Authentication only. Whether this account may actually use the product
  // (role, suspension, provisioning) is decided in src/lib/current-user.ts,
  // which needs a database read and runs on every page and server action.
  // Keeping the two layers separate means middleware stays cheap and there is
  // still a second, independent check before any data query.
  const isAuthenticated = !!user

  const pathname = request.nextUrl.pathname
  const isDashboardRoute = pathname.startsWith("/dashboard")
  const isLoginRoute = pathname === "/login"

  if (!isAuthenticated && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (isAuthenticated && isLoginRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
};
