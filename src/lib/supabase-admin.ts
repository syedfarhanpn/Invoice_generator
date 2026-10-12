import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * The service-role Supabase client.
 *
 * This key bypasses Row Level Security and can create, modify and delete any
 * auth user. It is a different class of secret from the publishable key and
 * must never reach the browser:
 *
 *  - Named without the NEXT_PUBLIC_ prefix, so Next will not inline it into
 *    a client bundle even by accident.
 *  - Only ever imported from Server Actions and route handlers. Importing
 *    this file from a Client Component is a bug, and the build will fail at
 *    the point the env var resolves to undefined rather than shipping a
 *    client with a dead client in it.
 *  - Sessions are disabled: this client acts as the service, never as a
 *    person, so there is no session to persist or refresh and no cookie for
 *    it to pick up.
 *
 * Returns null rather than throwing when the key is absent. An unconfigured
 * install is a normal state - the invite flow reports what is missing instead
 * of failing the whole page.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Whether the admin API is usable. The UI asks before promising anything. */
export function adminClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
}
