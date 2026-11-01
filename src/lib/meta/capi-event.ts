import { hashUserData, hasMatchableIdentity, type UserIdentity } from "./capi-hash"

/**
 * Building a CRM lead-stage event for Meta's Conversions API.
 *
 * The point of this, in plain terms: Meta knows which ad produced a lead, but
 * it has no idea which of those leads were any good. Sending the stages back -
 * contacted, qualified, won - is what lets it learn the difference and start
 * finding people who look like the ones that closed, instead of people who
 * look like the ones that filled in a form.
 *
 * Three details decide whether an event counts at all, and each one fails
 * silently when wrong:
 *
 *  1. action_source MUST be "system_generated". Anything else is read as a
 *     website or app event and never attaches to the lead.
 *  2. custom_data MUST carry at least one valid custom parameter - Meta
 *     rejects the event outright otherwise. event_source: "crm" and
 *     lead_event_source are the two that make it a Conversion Leads event.
 *  3. user_data.lead_id, when known, is the Meta instant-form lead id and is
 *     sent UNHASHED. It is by far the strongest match; hashed email and phone
 *     are the fallback when the lead did not come from an instant form.
 *
 * Pure: nothing here talks to the network. capi-client.ts does the sending,
 * so the payload can be asserted exactly without a token or a live dataset.
 */

/** Meta rejects a whole batch if any event is older than this. */
export const MAX_EVENT_AGE_DAYS = 7
/** Meta's limit per request. A rejected batch is discarded in full. */
export const MAX_BATCH_SIZE = 1000

const DAY_MS = 86_400_000

export type MetaUserData = {
  /** Meta's instant-form lead id. Not hashed - see note 3 above. */
  lead_id?: number
  em?: string[]
  ph?: string[]
  fn?: string[]
  ln?: string[]
  ct?: string[]
  st?: string[]
  zp?: string[]
  country?: string[]
  /** The _fbc click cookie, when the lead arrived through a tracked click. */
  fbc?: string
}

export type MetaServerEvent = {
  event_name: string
  event_time: number
  action_source: "system_generated"
  /** Stable per lead and stage, so a retry cannot count the same move twice. */
  event_id: string
  user_data: MetaUserData
  custom_data: {
    event_source: "crm"
    lead_event_source: string
    [key: string]: string | number
  }
}

export type LeadStageEventInput = {
  /** Our own deal id. Only used to make the dedup key. */
  dealId: string
  /** The stage name as the operator wrote it: "Qualified", "Proposal Sent". */
  stageName: string
  /** When the stage was reached. */
  occurredAt: Date
  /** When the lead itself was created - event_time must not precede it. */
  leadCreatedAt?: Date | null
  /** Meta's instant-form lead id, when this lead came from one. */
  metaLeadId?: string | number | null
  identity: UserIdentity
  /** Names the CRM to Meta. Required: the event is rejected without it. */
  leadEventSource: string
  /** Value of the deal, sent once it is worth money. */
  value?: number | null
  currency?: string | null
}

export type BuildResult =
  | { ok: true; event: MetaServerEvent }
  | { ok: false; reason: string }

/**
 * Builds one stage event, or explains why it cannot be sent.
 *
 * Returns a reason rather than throwing, because "this lead has no email, no
 * phone and no Meta lead id" is an ordinary outcome for a lead typed in by
 * hand - it is not an error, it is simply not sendable, and the caller logs
 * it and moves on.
 */
export function buildLeadStageEvent(input: LeadStageEventInput, now = new Date()): BuildResult {
  const stage = input.stageName.trim()
  if (!stage) return { ok: false, reason: "The stage has no name." }

  const source = input.leadEventSource.trim()
  if (!source) {
    // Guarded here rather than trusted from config: Meta discards the event
    // silently, so an empty string would look like a working integration
    // that attributes nothing.
    return { ok: false, reason: "lead_event_source is required and was empty." }
  }

  const hashed = hashUserData(input.identity)
  const leadId = parseMetaLeadId(input.metaLeadId)

  if (leadId == null && !hasMatchableIdentity(hashed)) {
    return {
      ok: false,
      reason: "No Meta lead id, email or phone - Meta would have nothing to match on.",
    }
  }

  const time = resolveEventTime(input.occurredAt, input.leadCreatedAt ?? null, now)
  if (!time.ok) return { ok: false, reason: time.reason }

  const user_data: MetaUserData = { ...hashed }
  if (leadId != null) user_data.lead_id = leadId

  const custom_data: MetaServerEvent["custom_data"] = {
    event_source: "crm",
    lead_event_source: source,
  }
  // Only once it is a real figure. A zero would teach Meta that a won deal
  // was worth nothing, which is worse than telling it nothing at all.
  if (input.value != null && input.value > 0) {
    custom_data.value = input.value
    custom_data.currency = (input.currency || "INR").toUpperCase()
  }

  return {
    ok: true,
    event: {
      event_name: stage,
      event_time: Math.floor(time.at.getTime() / 1000),
      action_source: "system_generated",
      event_id: dedupKey(input.dealId, stage),
      user_data,
      custom_data,
    },
  }
}

/**
 * A stable id for this lead reaching this stage.
 *
 * Deliberately NOT time-based: a retry after a network failure has to carry
 * the same id as the attempt that may or may not have landed, or a flaky
 * connection teaches Meta the lead qualified twice.
 *
 * Moving a lead back and forth across the same stage therefore reports once,
 * which is the honest reading - it reached that stage, and it reached it the
 * first time.
 */
export function dedupKey(dealId: string, stageName: string): string {
  const stage = stageName.trim().toLowerCase().replace(/\s+/g, "-")
  return `deal:${dealId}:${stage}`
}

/**
 * Whether a lead came from Meta and should be reported back to it.
 *
 * Source is free text the operator typed at import - "Meta Ads Sep-Oct" - so
 * this reads it generously. Leads from the mobile app or a referral are NOT
 * sent: Meta did not produce them, and telling it they converted would train
 * its targeting on people it never reached.
 */
export function isMetaLead(
  source: string | null | undefined,
  metaLeadId?: string | number | null
): boolean {
  if (parseMetaLeadId(metaLeadId) != null) return true
  return /\b(meta|facebook|instagram|fb|ig)\b/i.test(source ?? "")
}

/** Meta's lead ids are integers. Anything else is not one of theirs. */
export function parseMetaLeadId(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null
  const digits = String(value).trim()
  if (!/^\d+$/.test(digits)) return null
  const parsed = Number(digits)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

type TimeResult = { ok: true; at: Date } | { ok: false; reason: string }

/**
 * Settles what event_time to send.
 *
 * Two constraints, both of which discard the event when broken:
 *  - not more than 7 days in the past, and Meta fails the WHOLE batch on one
 *    stale event, so a too-old event is refused here rather than allowed to
 *    take 999 good ones down with it;
 *  - not before the lead was generated.
 *
 * A stage reached a moment before the lead row's own timestamp - clock skew,
 * or a lead created and qualified in the same second - is nudged forward to
 * the lead's time rather than refused, because the ordering is what Meta
 * cares about and a second is not a real disagreement.
 */
function resolveEventTime(occurredAt: Date, leadCreatedAt: Date | null, now: Date): TimeResult {
  if (Number.isNaN(occurredAt.getTime())) return { ok: false, reason: "The stage has no date." }

  let at = occurredAt
  if (leadCreatedAt && !Number.isNaN(leadCreatedAt.getTime()) && at < leadCreatedAt) {
    at = leadCreatedAt
  }

  // A future timestamp is clock skew; Meta reads it as invalid.
  if (at.getTime() > now.getTime()) at = now

  const ageDays = (now.getTime() - at.getTime()) / DAY_MS
  if (ageDays > MAX_EVENT_AGE_DAYS) {
    return {
      ok: false,
      reason: `That stage was reached ${Math.floor(ageDays)} days ago; Meta accepts up to ${MAX_EVENT_AGE_DAYS}.`,
    }
  }

  return { ok: true, at }
}

/**
 * Splits events into batches Meta will accept.
 *
 * At the limit rather than near it, and separate from the sender so the
 * chunking can be tested without a network call.
 */
export function batchEvents(
  events: MetaServerEvent[],
  size = MAX_BATCH_SIZE
): MetaServerEvent[][] {
  const limit = Math.max(1, Math.min(size, MAX_BATCH_SIZE))
  const out: MetaServerEvent[][] = []
  for (let i = 0; i < events.length; i += limit) out.push(events.slice(i, i + limit))
  return out
}
