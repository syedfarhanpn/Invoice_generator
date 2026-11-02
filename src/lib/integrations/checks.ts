import Anthropic from "@anthropic-ai/sdk"

import { GRAPH_API_VERSION } from "@/lib/meta/capi-client"

/**
 * Checking a key when it is saved, so a typo is caught on the settings page
 * rather than discovered weeks later as proposals that never write or lead
 * events that never arrive. Both checks are free: neither writes a proposal
 * nor sends an event.
 */

export type KeyCheck = { ok: true; warning: string | null } | { ok: false; error: string }

/** Lists one model. Costs nothing, and fails exactly when the key is bad. */
export async function checkClaudeKey(apiKey: string): Promise<KeyCheck> {
  try {
    await new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 }).models.list({ limit: 1 })
    return { ok: true, warning: null }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "Anthropic did not accept that key. Check you copied all of it." }
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return { ok: false, error: "That key is not allowed to use the API. Check it in the Claude Console." }
    }
    // Busy is not wrong: a rate-limited key is a working key.
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: true, warning: "Anthropic was busy, but the key was recognised." }
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "Could not reach Anthropic to check the key. Try again in a moment." }
    }
    return { ok: false, error: "Anthropic could not check the key just now. Try again in a moment." }
  }
}

/**
 * Reads the dataset with the token. The token goes in the Authorization
 * header, never the query string, so it stays out of request logs.
 *
 * Only an outright rejected token (Meta's code 190) refuses the save. Any
 * other answer is not proof the setup is wrong - this read can need a
 * permission that sending events does not - so it saves with a warning.
 */
export async function checkMetaConnection(datasetId: string, accessToken: string): Promise<KeyCheck> {
  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${datasetId}?fields=id`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (response.ok) return { ok: true, warning: null }

    const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null
    if (body?.error?.code === 190) {
      return { ok: false, error: "Meta did not accept that access token. It may be expired or incomplete." }
    }
    return {
      ok: true,
      warning: `Saved, but Meta could not confirm this token can reach dataset ${datasetId}. Send a test event from Events Manager to be sure.`,
    }
  } catch {
    return { ok: false, error: "Could not reach Meta to check the token. Try again in a moment." }
  }
}
