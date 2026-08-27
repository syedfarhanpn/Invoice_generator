import { NextResponse } from "next/server"

/**
 * One error shape for the whole public API, so an integrator can branch on
 * `error.code` instead of parsing prose.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "conflict"
  | "idempotency_key_reuse"
  | "rate_limited"
  | "internal_error"

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 422,
  conflict: 409,
  idempotency_key_reuse: 422,
  rate_limited: 429,
  internal_error: 500,
}

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string; details?: unknown }
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  headers?: Record<string, string>
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status: STATUS[code], headers }
  )
}

export function apiOk<T>(data: T, status = 200, headers?: Record<string, string>): NextResponse<T> {
  return NextResponse.json(data, { status, headers })
}

/**
 * Parses a JSON body without letting a malformed one become a 500. Also caps
 * the size: this is an unauthenticated-until-verified endpoint and the body is
 * read into memory.
 */
const MAX_BODY_BYTES = 512 * 1024

export async function readJsonBody(
  request: Request
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse<ApiErrorBody> }> {
  const declared = Number(request.headers.get("content-length") || 0)
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: apiError("invalid_request", "Request body is too large.") }
  }

  let raw: string
  try {
    raw = await request.text()
  } catch {
    return { ok: false, response: apiError("invalid_request", "Could not read the request body.") }
  }

  if (raw.length > MAX_BODY_BYTES) {
    return { ok: false, response: apiError("invalid_request", "Request body is too large.") }
  }
  if (!raw.trim()) return { ok: true, data: {} }

  try {
    return { ok: true, data: JSON.parse(raw) }
  } catch {
    return { ok: false, response: apiError("invalid_request", "Request body is not valid JSON.") }
  }
}
