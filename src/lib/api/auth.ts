import type { User } from "@prisma/client"

import prisma from "@/lib/db"
import { bearerFromHeader, parseApiKey, verifyApiKey } from "@/lib/api-key"
import { apiError, type ApiErrorBody } from "./http"
import type { NextResponse } from "next/server"

/**
 * Authenticates a request against a tenant's API key.
 *
 * This is the ONLY way into the public API, and the returned user id is the
 * tenant boundary: every query a route makes must be scoped by it. Nothing
 * here consults cookies, so a browser session can never authenticate an API
 * call and an API key can never drive the dashboard.
 */

export type ApiAuthResult =
  | { ok: true; user: User; apiKeyId: string }
  | { ok: false; response: NextResponse<ApiErrorBody> }

/** Only touch lastUsedAt this often, so auth stays a read on hot paths. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000

// Every failure returns exactly this - a caller must not be able to tell a
// nonexistent key from a revoked one from a suspended tenant.
const GENERIC_FAILURE = "Invalid or revoked API key."

export async function authenticateApiRequest(request: Request): Promise<ApiAuthResult> {
  const presented = bearerFromHeader(request.headers.get("authorization"))
  if (!presented) {
    return {
      ok: false,
      response: apiError("unauthorized", "Missing bearer token. Send: Authorization: Bearer ck_live_…", undefined, {
        "WWW-Authenticate": "Bearer",
      }),
    }
  }

  const parsed = parseApiKey(presented)
  if (!parsed) return { ok: false, response: apiError("unauthorized", GENERIC_FAILURE) }

  const record = await prisma.apiKey.findUnique({
    where: { lookupId: parsed.lookupId },
    include: { user: true },
  })
  if (!record) return { ok: false, response: apiError("unauthorized", GENERIC_FAILURE) }

  // Constant-time, and checked before any status branch so timing does not
  // distinguish "wrong secret" from "revoked key".
  if (!verifyApiKey(presented, record.keyHash)) {
    return { ok: false, response: apiError("unauthorized", GENERIC_FAILURE) }
  }
  if (record.revokedAt) return { ok: false, response: apiError("unauthorized", GENERIC_FAILURE) }

  // A suspended tenant loses API access at the same moment they lose dashboard
  // access - suspension must not be bypassable by holding an older key.
  if (record.user.status !== "ACTIVE") {
    return { ok: false, response: apiError("forbidden", "This account is suspended.") }
  }

  const lastUsed = record.lastUsedAt?.getTime() ?? 0
  if (Date.now() - lastUsed > LAST_USED_THROTTLE_MS) {
    // Best effort: a bookkeeping write must never fail a valid request.
    await prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})
  }

  return { ok: true, user: record.user, apiKeyId: record.id }
}
