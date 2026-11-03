import { formatTableDay } from "@/lib/dates"

import type { IntegrationSummary } from "./store"

/**
 * What a page may know about an integration, and the rules for the Meta
 * fields - shared by the company's own Settings page and the platform admin's
 * company popup, so the two can never disagree. Pure: no database, no
 * secrets, safe to import from the browser.
 */

/** A connection as shown: never the secret, at most its last four characters. */
export type ConnectionView = {
  connected: boolean
  /** False when a secret is stored but this server cannot decrypt it. */
  readable: boolean
  hint: string | null
  datasetId: string | null
  testEventCode: string | null
  updatedLabel: string | null
}

/** Dates formatted on the server, so the browser receives plain strings. */
export function toConnectionView(summary: IntegrationSummary): ConnectionView {
  return {
    connected: summary.connected,
    readable: summary.readable,
    hint: summary.hint,
    datasetId: summary.datasetId,
    testEventCode: summary.testEventCode,
    updatedLabel: summary.updatedAt ? formatTableDay(summary.updatedAt) : null,
  }
}

/** What a save or a disconnect reports back. */
export type IntegrationResult = { ok: true; warning: string | null } | { ok: false; error: string }

export type MetaInput = { datasetId: string; accessToken: string; testEventCode: string }

/**
 * The Meta fields, cleaned, or the reason they cannot be saved.
 *
 * A blank token is allowed and means "keep the one already saved", so the
 * dataset or the test code can be changed without fetching the token from
 * Meta again. Whether there IS one to keep is the caller's to check.
 */
export function normalizeMetaInput(
  input: MetaInput
): { ok: true; datasetId: string; accessToken: string | null; testEventCode: string | null } | { ok: false; error: string } {
  const datasetId = input.datasetId.trim()
  if (!/^\d{5,30}$/.test(datasetId)) {
    return { ok: false, error: "The dataset ID is the number shown in Events Manager, digits only." }
  }
  return {
    ok: true,
    datasetId,
    accessToken: input.accessToken.trim() || null,
    testEventCode: input.testEventCode.trim().slice(0, 64) || null,
  }
}
