"use server"

import { revalidatePath } from "next/cache"
import type { BillingCycle, SubscriptionKind, SubscriptionStatus } from "@prisma/client"

import { assertPermission } from "@/lib/access"
import { getCurrentUser } from "@/lib/current-user"
import prisma from "@/lib/db"
import { currentOrgId, resolveAssignee } from "@/lib/members"
import { advanceByCycle, moduleForKind } from "@/lib/renewals"

/**
 * Writes for subscriptions - AMCs, domains, hosting.
 *
 * The one that matters is renewSubscription(). Paying a renewal is the most
 * common thing anyone does here, and doing it by editing a date by hand is
 * both tedious and the easy way to type the wrong year. One click advances the
 * date by exactly one cycle from the date that was due, not from today: a
 * domain renewed three days late still renews on its own anniversary next
 * year, rather than drifting three days later every time.
 */

const KINDS: SubscriptionKind[] = ["AMC", "DOMAIN", "HOSTING", "SSL", "EMAIL", "OTHER"]
const CYCLES: BillingCycle[] = [
  "MONTHLY",
  "QUARTERLY",
  "HALF_YEARLY",
  "YEARLY",
  "BIENNIAL",
  "TRIENNIAL",
]
const STATUSES: SubscriptionStatus[] = ["ACTIVE", "CANCELLED"]

// moduleForKind lives in lib/renewals.ts: one table backs one screen with two
// modules behind it, and the row's kind is what decides - never the tab the
// request happened to come from.

export type SubscriptionInput = {
  id?: string
  kind: string
  name: string
  clientId: string | null
  projectId: string | null
  provider: string | null
  accountRef: string | null
  startsOn: string
  renewsOn: string
  cycle: string
  cost: string
  price: string
  autoRenew: boolean
  status: string
  ownerId: string | null
  notes: string | null
}

/** IST, the clock the rest of the app reads operator-entered dates in. */
const OPERATOR_OFFSET = "+05:30"

function parseDay(value: string | null | undefined, fallback: Date | null): Date | null {
  if (!value?.trim()) return fallback
  // Noon rather than midnight, so a date entered in IST cannot land on the
  // previous UTC day and read as a day early everywhere it is shown.
  const parsed = new Date(`${value.trim()}T12:00:00${OPERATOR_OFFSET}`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

/** Null rather than zero for a blank: "nothing is charged" and "it is free"
 *  are different facts, and only one of them belongs in a margin. */
function parseMoney(value: string): number | null {
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return null
  const parsed = Number(trimmed.replace(/[^0-9.]/g, ""))
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("An amount cannot be negative.")
  }
  return parsed
}

async function resolveClient(userId: string, clientId: string | null) {
  if (!clientId) return null
  const client = await prisma.client.findFirst({
    where: { id: clientId, userId },
    select: { id: true },
  })
  if (!client) throw new Error("That client no longer exists.")
  return client.id
}

async function resolveProject(userId: string, projectId: string | null) {
  if (!projectId) return null
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, archivedAt: null },
    select: { id: true },
  })
  if (!project) throw new Error("That project no longer exists.")
  return project.id
}

export async function saveSubscription(input: SubscriptionInput) {
  const name = input.name.trim()
  if (!name) throw new Error("Give this a name - the domain, or what the contract covers.")

  const kind = KINDS.includes(input.kind as SubscriptionKind)
    ? (input.kind as SubscriptionKind)
    : "OTHER"

  // Gated on what this row IS, not on which page asked.
  await assertPermission(moduleForKind(kind), "write")
  const user = await getCurrentUser()
  const cycle = CYCLES.includes(input.cycle as BillingCycle)
    ? (input.cycle as BillingCycle)
    : "YEARLY"
  const status = STATUSES.includes(input.status as SubscriptionStatus)
    ? (input.status as SubscriptionStatus)
    : "ACTIVE"

  const startsOn = parseDay(input.startsOn, new Date())!
  const renewsOn = parseDay(input.renewsOn, advanceByCycle(startsOn, cycle))!

  // Checked here as well as by the CHECK constraint, because the constraint
  // can only reject - this can say which date is the problem.
  if (renewsOn.getTime() < startsOn.getTime()) {
    throw new Error("The renewal date cannot be before the start date.")
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { currency: true },
  })

  const data = {
    kind,
    name,
    clientId: await resolveClient(user.id, input.clientId),
    projectId: await resolveProject(user.id, input.projectId),
    provider: input.provider?.trim() || null,
    accountRef: input.accountRef?.trim() || null,
    startsOn,
    renewsOn,
    cycle,
    cost: parseMoney(input.cost),
    price: parseMoney(input.price),
    currency: profile?.currency || "INR",
    autoRenew: Boolean(input.autoRenew),
    status,
    ownerId: await resolveAssignee(user.id, input.ownerId),
    notes: input.notes?.trim() || null,
  }

  if (input.id) {
    // Scoped by userId so an id from elsewhere updates nothing.
    const existing = await prisma.subscription.findFirst({
      where: { id: input.id, userId: user.id, archivedAt: null },
      select: { id: true },
    })
    if (!existing) throw new Error("That subscription no longer exists.")
    await prisma.subscription.update({ where: { id: input.id }, data })
  } else {
    await prisma.subscription.create({
      data: { ...data, userId: user.id, orgId: await currentOrgId(user.id) },
    })
  }

  revalidatePath("/renewals")
}

/**
 * Mark a renewal as paid and move the date on by one cycle.
 *
 * Advances from the date that was due rather than from today, so a renewal
 * paid late does not shift the anniversary permanently. If something is years
 * stale the loop catches it up to the next date still in the future, so one
 * click cannot leave it still reading as overdue.
 */
export async function renewSubscription(subscriptionId: string) {
  const user = await getCurrentUser()

  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId: user.id, archivedAt: null },
    select: { id: true, kind: true, renewsOn: true, cycle: true },
  })
  if (!subscription) throw new Error("That subscription no longer exists.")

  // After the row is loaded, because the kind is what decides which
  // permission applies - and the row is scoped to this user, so a stranger
  // learns nothing from the lookup either way.
  await assertPermission(moduleForKind(subscription.kind), "write")

  const now = new Date()
  let next = advanceByCycle(subscription.renewsOn, subscription.cycle)
  // Bounded: a date typed as 1970 must not spin.
  for (let i = 0; i < 200 && next.getTime() <= now.getTime(); i += 1) {
    next = advanceByCycle(next, subscription.cycle)
  }

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { renewsOn: next, lastRenewedAt: now, status: "ACTIVE" },
  })

  revalidatePath("/renewals")
}

export async function archiveSubscription(subscriptionId: string) {
  const user = await getCurrentUser()
  const subscription = await prisma.subscription.findFirst({
    where: { id: subscriptionId, userId: user.id, archivedAt: null },
    select: { id: true, kind: true },
  })
  if (!subscription) throw new Error("That subscription no longer exists.")

  await assertPermission(moduleForKind(subscription.kind), "write")

  // Archived, not deleted: what a domain cost last year is what this year is
  // judged against, and any expense linked to it would lose its reason.
  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { archivedAt: new Date() },
  })

  revalidatePath("/renewals")
}
