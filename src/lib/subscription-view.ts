import { formatShortDay } from "@/lib/dates"
import {
  CYCLE_LABEL,
  daysUntil,
  describeRenewal,
  KIND_LABEL,
  urgencyOf,
} from "@/lib/renewals"
import type { SubscriptionRecord } from "@/lib/subscription-stats"
import type { SubscriptionViewRow } from "@/components/workspace/subscriptions-view"

/**
 * Turns a database record into the row the table renders.
 *
 * Deliberately done on the server: `days` and `urgency` depend on the current
 * time, and working them out again in the browser would have the two clocks
 * disagree on every row, which React reports as a hydration mismatch.
 */
export function toSubscriptionViewRow(
  record: SubscriptionRecord,
  now = new Date()
): SubscriptionViewRow {
  const days = daysUntil(record.renewsOn, now)

  return {
    id: record.id,
    kind: record.kind,
    kindLabel: KIND_LABEL[record.kind],
    name: record.name,
    status: record.status,
    // The date input wants YYYY-MM-DD; these are stored at midday IST, so the
    // UTC day and the day the operator typed are the same one.
    startsOn: record.startsOn.toISOString().slice(0, 10),
    renewsOn: record.renewsOn.toISOString().slice(0, 10),
    renewsOnLabel: formatShortDay(record.renewsOn),
    days,
    urgency: urgencyOf(days),
    cycle: record.cycle,
    cycleLabel: CYCLE_LABEL[record.cycle],
    cost: record.cost,
    price: record.price,
    autoRenew: record.autoRenew,
    provider: record.provider,
    accountRef: record.accountRef,
    notes: record.notes,
    clientId: record.clientId,
    clientName: record.clientName,
    projectId: record.projectId,
    projectTitle: record.projectTitle,
    ownerId: record.ownerId,
    ownerName: record.ownerName,
    lastRenewedLabel: record.lastRenewedAt ? formatShortDay(record.lastRenewedAt) : null,
    dueLabel: describeRenewal(days),
  }
}
