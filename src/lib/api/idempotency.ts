import type { NextResponse } from "next/server"

import prisma from "@/lib/db"
import { hashContent } from "@/lib/hash"
import { apiError, apiOk, type ApiErrorBody } from "./http"

/**
 * Replay protection for unsafe API calls.
 *
 * A CRM that times out and retries must not create a second client or a second
 * invoice. Send `Idempotency-Key: <uuid>` and a repeat of the same call returns
 * the original stored response instead of doing the work again.
 *
 * Reusing a key with a DIFFERENT body is an error rather than a silent replay -
 * that combination means a bug in the caller, and returning the old response
 * would hide it.
 */

export type IdempotencyOutcome<T> =
  | { replay: true; response: NextResponse<T | ApiErrorBody> }
  | { replay: false; commit: (status: number, body: unknown) => Promise<void> }
  | { error: NextResponse<ApiErrorBody> }

export async function withIdempotency<T>(
  request: Request,
  userId: string,
  endpoint: string,
  body: unknown
): Promise<IdempotencyOutcome<T>> {
  const key = request.headers.get("idempotency-key")?.trim()

  // Optional by design: a caller that does not send one simply gets no replay
  // protection, which is the standard contract (Stripe, etc).
  if (!key) {
    return { replay: false, commit: async () => {} }
  }
  if (key.length > 255) {
    return { error: apiError("invalid_request", "Idempotency-Key must be 255 characters or fewer.") }
  }

  const requestHash = hashContent({ endpoint, body })
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { userId_key: { userId, key } },
  })

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return {
        error: apiError(
          "idempotency_key_reuse",
          "This Idempotency-Key was already used with a different request body."
        ),
      }
    }
    return {
      replay: true,
      response: apiOk(existing.responseBody as T, existing.responseStatus, {
        "Idempotent-Replay": "true",
      }),
    }
  }

  return {
    replay: false,
    commit: async (status, responseBody) => {
      // Only successful work is worth replaying; a failed call should be free
      // to be retried and actually succeed the second time.
      if (status >= 400) return
      await prisma.idempotencyRecord
        .create({
          data: {
            userId,
            key,
            endpoint,
            requestHash,
            responseStatus: status,
            responseBody: responseBody as never,
          },
        })
        // A race between two identical in-flight retries hits the unique
        // constraint. Both did the same work, so losing the record is
        // harmless - never fail the caller for it.
        .catch(() => {})
    },
  }
}
