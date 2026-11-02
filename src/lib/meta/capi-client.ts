import { randomUUID } from "node:crypto"

import prisma from "@/lib/db"
import { metaConnection } from "@/lib/integrations/store"

import { batchEvents, buildLeadStageEvent, type LeadStageEventInput } from "./capi-event"

/**
 * Sending lead-stage events to Meta's Conversions API.
 *
 * Each company connects its OWN dataset, in Settings - Integrations, and its
 * leads go there and nowhere else (src/lib/integrations/store.ts). SILENT
 * when a company has not connected Meta: it must not see errors on every
 * board drag. What a connection holds, all of it server-side - the access
 * token in particular never reaches the browser:
 *
 *   dataset id        the dataset (formerly pixel) the events go to
 *   access token      a System User token with ads_management
 *   test event code   optional; routes events to Test Events in Events
 *                     Manager instead of the live dataset. Remove it once
 *                     the events look right.
 *
 * Every attempt - sent, refused by us, or rejected by Meta - is written to
 * SyncLog, so "is this working" has an answer that is not a guess. The log
 * records ids and outcomes only, never the user_data: those are hashes of
 * people's contact details, and an audit table is not the place for them.
 */

/** The Graph API version the payload was written against. */
export const GRAPH_API_VERSION = "v26.0"

/**
 * Names this CRM to Meta, as "Salesforce" or "HubSpot" would. Required:
 * an event without it is not registered as a Conversion Leads event.
 */
export const LEAD_EVENT_SOURCE = "Pixie Webs CRM"

type SendOutcome = { sent: number; refused: number; failed: number }

/**
 * Builds, sends and logs a set of lead-stage events.
 *
 * Never throws. This runs after the board move has already been saved and
 * answered, so there is nobody left to show an error to - the outcome goes
 * to SyncLog instead.
 */
export async function sendLeadStageEvents(
  workspaceId: string,
  orgId: string | null,
  inputs: LeadStageEventInput[]
): Promise<SendOutcome> {
  if (inputs.length === 0) return { sent: 0, refused: 0, failed: 0 }
  // The company's own dataset. A company with none sends nothing, rather than
  // borrowing another company's.
  const config = await metaConnection(orgId)
  if (!config) return { sent: 0, refused: 0, failed: 0 }

  const outcome: SendOutcome = { sent: 0, refused: 0, failed: 0 }
  const ready = []

  for (const input of inputs) {
    const built = buildLeadStageEvent(input)
    if (built.ok) {
      ready.push({ input, event: built.event })
    } else {
      // Refused by us, before Meta saw it - a lead with nothing to match on,
      // or a stage reached more than seven days ago.
      outcome.refused++
      await log(workspaceId, orgId, input.dealId, null, "FAILED", null, built.reason)
    }
  }

  for (const batch of batchEvents(ready.map((r) => r.event))) {
    const dealIds = ready.filter((r) => batch.includes(r.event)).map((r) => r.input.dealId)
    try {
      const response = await fetch(
        `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.datasetId}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: batch,
            ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
            // In the body rather than the query string, so the token never
            // lands in a proxy's or a CDN's request log.
            access_token: config.accessToken,
          }),
          signal: AbortSignal.timeout(10_000),
        }
      )

      const body = (await response.json().catch(() => null)) as {
        events_received?: number
        fbtrace_id?: string
        error?: { message?: string }
      } | null

      if (response.ok) {
        outcome.sent += batch.length
        for (const dealId of dealIds) {
          await log(workspaceId, orgId, dealId, body?.fbtrace_id ?? null, "SUCCESS", response.status, null)
        }
      } else {
        // Meta discards a rejected batch whole, so every event in it failed.
        outcome.failed += batch.length
        const reason = body?.error?.message?.slice(0, 500) ?? `HTTP ${response.status}`
        for (const dealId of dealIds) {
          await log(workspaceId, orgId, dealId, body?.fbtrace_id ?? null, "FAILED", response.status, reason)
        }
      }
    } catch (err) {
      outcome.failed += batch.length
      const reason = err instanceof Error ? err.message.slice(0, 500) : "Network error"
      for (const dealId of dealIds) {
        await log(workspaceId, orgId, dealId, null, "FAILED", null, reason)
      }
    }
  }

  return outcome
}

async function log(
  userId: string,
  orgId: string | null,
  dealId: string,
  remoteId: string | null,
  status: "SUCCESS" | "FAILED",
  statusCode: number | null,
  error: string | null
) {
  try {
    await prisma.syncLog.create({
      data: {
        // The CRM tables carry no column defaults - see src/lib/boards.ts.
        id: randomUUID(),
        userId,
        orgId,
        direction: "PUSH",
        entity: "meta.capi.lead_stage",
        localId: dealId,
        remoteId,
        status,
        statusCode,
        error,
        createdAt: new Date(),
      },
    })
  } catch {
    // A log that cannot be written must not turn into an error about the
    // thing it was logging.
  }
}
