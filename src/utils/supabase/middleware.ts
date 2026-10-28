import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Paths that never carry a dashboard session: the shared documents and client
 * portal a client opens, and the REST surface, which authenticates with an API
 * key rather than cookies (see src/lib/api/auth.ts). Returning before the
 * Supabase client is built keeps a shared link from paying for session
 * handling it has no use for.
 */
const SESSIONLESS_PREFIXES = ["/share", "/api/"]

/**
 * Every area that requires a session. Public routes are everything else.
 *
 * A list rather than one "/dashboard" prefix because the workspace modules are
 * siblings of the invoicing tree, not children of it. They were already safe -
 * getCurrentUser() redirects before any query - but that costs a render and a
 * database round trip to reach the same answer this gets to for free.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/crm", "/projects", "/tasks", "/calendar", "/portal"]

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
  const isLoginRoute = pathname === "/login"

  // The root is a doorway, not a page. Decided here rather than after a render
  // so there is no marketing screen to blink past on the way in.
  if (pathname === "/") {
    const url = request.nextUrl.clone()
    url.pathname = isAuthenticated ? "/dashboard" : "/login"
    return NextResponse.redirect(url)
  }

  // Matched on a segment boundary so a future public "/projects-guide" could
  // never be swept up by the "/projects" entry - the same rule src/lib/nav.ts
  // uses for highlighting.
  const isProtectedRoute = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

  if (!isAuthenticated && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // The `error` guard breaks a redirect loop. A suspended account still holds
  // a valid Supabase session, so it is "authenticated" here; getCurrentUser()
  // refuses it and sends it to /login?error=..., and its sign-out cannot clear
  // the cookie from inside a Server Component render. Without this, that
  // account would bounce between /login and /dashboard forever instead of
  // reading why it was refused.
  if (isAuthenticated && isLoginRoute && !request.nextUrl.searchParams.has("error")) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
};
