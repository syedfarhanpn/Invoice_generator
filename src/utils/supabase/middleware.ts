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

  // Refresh the session and get the current user. Do not remove this call -
  // it's what keeps Supabase's auth cookies valid across requests.
  const { data: { user } } = await supabase.auth.getUser()

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
