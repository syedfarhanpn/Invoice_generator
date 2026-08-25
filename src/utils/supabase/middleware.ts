import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const updateSession = async (request: NextRequest) => {
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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
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

  // Refresh the session and get the current user. Do not remove this call -
  // it's what keeps Supabase's auth cookies valid across requests.
  const { data: { user } } = await supabase.auth.getUser()

  // This app is single-admin: only SUPER_ADMIN_EMAIL may hold a session.
  // getCurrentUser() (src/lib/current-user.ts) enforces this too and is the
  // layer that actually blocks data access, but checking it here as well -
  // a plain env-var comparison, no DB needed - avoids bouncing a rejected
  // session through /dashboard before it gets sent back to /login.
  // Normalized on both sides for the same reason as getCurrentUser(): Supabase
  // treats emails case-insensitively, so a raw === would bounce a valid admin.
  const adminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim()
  const isAdmin =
    !!adminEmail && user?.email?.toLowerCase().trim() === adminEmail

  const pathname = request.nextUrl.pathname
  const isDashboardRoute = pathname.startsWith("/dashboard")
  const isLoginRoute = pathname === "/login"

  if (!isAdmin && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (isAdmin && isLoginRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
};
