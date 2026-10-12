import type { SubscriptionKind } from "@prisma/client"

import prisma from "@/lib/db"
import { summariseSubscriptions, type SubscriptionLike } from "@/lib/subscription-summary"

/**
 * The database half of the renewals figures.
 *
 * Only the query lives here; every rule about what the numbers mean is in
 * subscription-summary.ts, which is pure and unit tested. Same split as
 * expense-stats / expense-summary, and for the same reason: `npm test` runs
 * with no database and no secrets.
 */

export type { SubscriptionStats } from "@/lib/subscription-summary"

export type SubscriptionRecord = SubscriptionLike & {
  provider: string | null
  accountRef: string | null
  projectTitle: string | null
  clientId: string | null
  projectId: string | null
  ownerId: string | null
  ownerName: string | null
  startsOn: Date
  lastRenewedAt: Date | null
  notes: string | null
}

export async function getSubscriptions(
  userId: string,
  kinds: SubscriptionKind[]
): Promise<{ rows: SubscriptionRecord[]; currency: string }> {
  const [profile, subscriptions] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId }, select: { currency: true } }),
    prisma.subscription.findMany({
      where: { userId, archivedAt: null, kind: { in: kinds } },
      // Soonest first: the list is a queue of things to act on, and the thing
      // already overdue belongs at the top of it.
      orderBy: [{ renewsOn: "asc" }],
      select: {
        id: true,
        kind: true,
        name: true,
        status: true,
        startsOn: true,
        renewsOn: true,
        cycle: true,
        cost: true,
        price: true,
        currency: true,
        autoRenew: true,
        provider: true,
        accountRef: true,
        lastRenewedAt: true,
        notes: true,
        clientId: true,
        projectId: true,
        ownerId: true,
        client: { select: { businessName: true, fullName: true } },
        project: { select: { title: true } },
        owner: {
          select: {
            user: { select: { name: true, email: true, businessProfile: { select: { ownerName: true } } } },
          },
        },
      },
    }),
  ])

  const rows: SubscriptionRecord[] = subscriptions.map((s) => ({
    id: s.id,
    kind: s.kind,
    name: s.name,
    status: s.status,
    startsOn: s.startsOn,
    renewsOn: s.renewsOn,
    cycle: s.cycle,
    cost: s.cost != null ? Number(s.cost) : null,
    price: s.price != null ? Number(s.price) : null,
    currency: s.currency,
    autoRenew: s.autoRenew,
    provider: s.provider,
    accountRef: s.accountRef,
    lastRenewedAt: s.lastRenewedAt,
    notes: s.notes,
    clientId: s.clientId,
    clientName: s.client?.businessName || s.client?.fullName || null,
    projectId: s.projectId,
    projectTitle: s.project?.title ?? null,
    ownerId: s.ownerId,
    ownerName: s.owner?.user.name?.trim() || s.owner?.user.businessProfile?.ownerName?.trim() || null,
  }))

  return { rows, currency: profile?.currency || "INR" }
}

export async function getSubscriptionStats(
  userId: string,
  kinds: SubscriptionKind[],
  now = new Date()
) {
  const { rows, currency } = await getSubscriptions(userId, kinds)
  return { stats: summariseSubscriptions(rows, currency, now), rows, currency }
}
