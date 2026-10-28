"use server"

import { revalidatePath } from "next/cache"
import type { TicketChannel, TicketPriority, TicketStatus } from "@prisma/client"

import { assertPermission } from "@/lib/access"
import prisma from "@/lib/db"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import { currentOrgId, resolveAssignee } from "@/lib/members"
import { SETTLED } from "@/lib/ticket-summary"

/**
 * Writes for support tickets.
 *
 * Two things here are not just CRUD:
 *
 *  - The ticket number is allocated under a row lock on User, exactly as
 *    document serials are, so two tickets raised at the same moment cannot be
 *    handed the same number. The unique index is the backstop.
 *  - firstRespondedAt is stamped by the first PUBLIC reply and never after,
 *    so response time is measured rather than estimated. An internal note is
 *    not a response to the client and must not stop that clock.
 */

const STATUSES: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CLIENT",
  "RESOLVED",
  "CLOSED",
]
const PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"]
const CHANNELS: TicketChannel[] = ["EMAIL", "PHONE", "WHATSAPP", "IN_PERSON", "PORTAL", "OTHER"]

export type TicketInput = {
  id?: string
  subject: string
  body: string | null
  clientId: string | null
  projectId: string | null
  status: string
  priority: string
  channel: string
  assigneeId: string | null
  dueAt: string | null
}

/** IST, the operator's own clock - a promised reply time is an appointment. */
const OPERATOR_OFFSET = "+05:30"

function parseWhen(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null
  const raw = value.trim()
  // A datetime-local value has no zone; pin it to the operator's.
  const parsed = new Date(raw.length <= 10 ? `${raw}T17:00:00${OPERATOR_OFFSET}` : `${raw}:00${OPERATOR_OFFSET}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
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

export async function saveTicket(input: TicketInput) {
  await assertPermission("tickets", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const subject = input.subject.trim()
  if (!subject) throw new Error("A ticket needs a subject.")

  const status = STATUSES.includes(input.status as TicketStatus)
    ? (input.status as TicketStatus)
    : "OPEN"
  const priority = PRIORITIES.includes(input.priority as TicketPriority)
    ? (input.priority as TicketPriority)
    : "NORMAL"
  const channel = CHANNELS.includes(input.channel as TicketChannel)
    ? (input.channel as TicketChannel)
    : "EMAIL"

  const data = {
    subject,
    body: input.body?.trim() || null,
    clientId: await resolveClient(workspaceId, input.clientId),
    projectId: await resolveProject(workspaceId, input.projectId),
    status,
    priority,
    channel,
    assigneeId: await resolveAssignee(workspaceId, input.assigneeId),
    dueAt: parseWhen(input.dueAt),
  }

  if (input.id) {
    const existing = await prisma.ticket.findFirst({
      where: { id: input.id, userId: workspaceId, archivedAt: null },
      select: { id: true, status: true, resolvedAt: true, closedAt: true },
    })
    if (!existing) throw new Error("That ticket no longer exists.")

    await prisma.ticket.update({
      where: { id: input.id },
      data: { ...data, ...settlementStamps(existing, status) },
    })
  } else {
    const orgId = await currentOrgId(workspaceId)

    // One transaction: the counter and the row it names move together, or
    // neither does.
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ ticketSeq: number }[]>`
        SELECT "ticketSeq" FROM "User" WHERE "id" = ${workspaceId} FOR UPDATE
      `
      const current = rows[0]?.ticketSeq
      if (current == null) throw new Error("Could not allocate a ticket number.")
      const next = current + 1

      await tx.$executeRaw`UPDATE "User" SET "ticketSeq" = ${next} WHERE "id" = ${workspaceId}`

      await tx.ticket.create({
        data: {
          ...data,
          ...settlementStamps(null, status),
          number: next,
          userId: workspaceId,
          orgId,
        },
      })
    })
  }

  revalidatePath("/tickets")
}

/**
 * Keeps resolvedAt and closedAt honest as the status moves.
 *
 * Stamped when a ticket first reaches that state and cleared if it is reopened
 * - a resolution date on a ticket that is open again would make every
 * "resolved this week" figure wrong, and quietly.
 */
function settlementStamps(
  existing: { status: TicketStatus; resolvedAt: Date | null; closedAt: Date | null } | null,
  next: TicketStatus
): { resolvedAt?: Date | null; closedAt?: Date | null } {
  const now = new Date()
  const wasSettled = existing ? SETTLED.includes(existing.status) : false
  const isSettled = SETTLED.includes(next)

  if (!wasSettled && isSettled) {
    return {
      resolvedAt: existing?.resolvedAt ?? now,
      closedAt: next === "CLOSED" ? now : (existing?.closedAt ?? null),
    }
  }
  if (wasSettled && !isSettled) {
    // Reopened: it is no longer resolved, so neither stamp is true any more.
    return { resolvedAt: null, closedAt: null }
  }
  if (isSettled && next === "CLOSED" && existing && !existing.closedAt) {
    return { closedAt: now }
  }
  return {}
}

export async function addTicketReply(input: {
  ticketId: string
  body: string
  fromClient: boolean
  internal: boolean
}) {
  await assertPermission("tickets", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const body = input.body.trim()
  if (!body) throw new Error("Write something before sending.")

  const ticket = await prisma.ticket.findFirst({
    where: { id: input.ticketId, userId: workspaceId, archivedAt: null },
    select: { id: true, firstRespondedAt: true },
  })
  if (!ticket) throw new Error("That ticket no longer exists.")

  // A message from the client is something the client said; it can never be
  // an internal note. The database rejects the pairing too - this explains it.
  const visibility = input.fromClient ? "PUBLIC" : input.internal ? "INTERNAL" : "PUBLIC"

  const membership = await prisma.membership.findFirst({
    where: { userId: workspaceId, status: { in: ["ACTIVE", "INVITED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.ticketReply.create({
      data: {
        ticketId: ticket.id,
        body,
        fromClient: input.fromClient,
        visibility,
        authorId: input.fromClient ? null : (membership?.id ?? null),
      },
    })

    // The clock stops on the first reply the client can actually see, and
    // only once. An internal note is not a response to them.
    if (!ticket.firstRespondedAt && !input.fromClient && visibility === "PUBLIC") {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { firstRespondedAt: new Date() },
      })
    }
  })

  revalidatePath("/tickets")
}

export async function archiveTicket(ticketId: string) {
  await assertPermission("tickets", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, userId: workspaceId, archivedAt: null },
    select: { id: true },
  })
  if (!ticket) throw new Error("That ticket no longer exists.")

  // Archived, not deleted: the number stays allocated and the history of what
  // a client reported stays provable.
  await prisma.ticket.update({
    where: { id: ticketId },
    data: { archivedAt: new Date() },
  })

  revalidatePath("/tickets")
}
