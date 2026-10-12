import type { TicketPriority, TicketStatus } from "@prisma/client"

/**
 * The figures above the support queue.
 *
 * The distinction the whole module exists for: a ticket waiting on the client
 * is not a ticket waiting on us. Lumping them into one "open" number is how a
 * queue of three real jobs reads as eleven and stops being looked at. Every
 * ticket is in exactly one status, so the counts below are disjoint and add up
 * to the total.
 *
 * Nothing here is stored. Age, overdue and response time are all timestamps
 * compared against now.
 */

export type TicketLike = {
  status: TicketStatus
  priority: TicketPriority
  createdAt: Date
  dueAt: Date | null
  firstRespondedAt: Date | null
  resolvedAt: Date | null
  assigneeId: string | null
}

/** Statuses where the next move is ours. */
export const NEEDS_US: TicketStatus[] = ["OPEN", "IN_PROGRESS"]

/** Statuses where the ticket is finished. */
export const SETTLED: TicketStatus[] = ["RESOLVED", "CLOSED"]

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_ON_CLIENT: "Waiting on client",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
}

/** Most urgent first, for sorting a queue. */
export const PRIORITY_RANK: Record<TicketPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
}

export type TicketStats = {
  total: number
  /** OPEN + IN_PROGRESS. The real size of the queue. */
  needsUs: number
  waitingOnClient: number
  resolved: number
  closed: number
  /** Past dueAt and not yet settled. A subset of needsUs/waitingOnClient. */
  overdue: number
  /** Needs us, nobody assigned. */
  unassigned: number
  urgent: number
  /** Opened in the last seven days. */
  openedThisWeek: number
  resolvedThisWeek: number
  /** Median hours to the first reply, over tickets that got one. Null when
   *  none has, because a median of nothing is not zero. */
  medianFirstResponseHours: number | null
  /** Hours since the oldest unanswered ticket arrived. Null when none. */
  oldestUnansweredHours: number | null
  byStatus: { label: string; value: number }[]
  byPriority: { label: string; value: number }[]
}

const HOUR_MS = 3_600_000

/** The middle value, averaging the two middles for an even count. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function summariseTickets(tickets: TicketLike[], now = new Date()): TicketStats {
  const weekAgo = new Date(now.getTime() - 7 * 24 * HOUR_MS)

  let needsUs = 0
  let waitingOnClient = 0
  let resolved = 0
  let closed = 0
  let overdue = 0
  let unassigned = 0
  let urgent = 0
  let openedThisWeek = 0
  let resolvedThisWeek = 0
  let oldestUnansweredHours: number | null = null

  const responseHours: number[] = []
  const status = new Map<string, number>()
  const priority = new Map<string, number>()

  for (const ticket of tickets) {
    const settled = SETTLED.includes(ticket.status)
    const ours = NEEDS_US.includes(ticket.status)

    if (ours) needsUs += 1
    else if (ticket.status === "WAITING_ON_CLIENT") waitingOnClient += 1
    if (ticket.status === "RESOLVED") resolved += 1
    if (ticket.status === "CLOSED") closed += 1

    // Overdue only means something while someone still owes a reply.
    if (!settled && ticket.dueAt && ticket.dueAt.getTime() < now.getTime()) overdue += 1

    if (ours && !ticket.assigneeId) unassigned += 1
    if (!settled && ticket.priority === "URGENT") urgent += 1

    if (ticket.createdAt >= weekAgo) openedThisWeek += 1
    if (ticket.resolvedAt && ticket.resolvedAt >= weekAgo) resolvedThisWeek += 1

    if (ticket.firstRespondedAt) {
      responseHours.push(
        (ticket.firstRespondedAt.getTime() - ticket.createdAt.getTime()) / HOUR_MS
      )
    } else if (!settled) {
      // Never answered and still live - this is the one that embarrasses you.
      const waiting = (now.getTime() - ticket.createdAt.getTime()) / HOUR_MS
      if (oldestUnansweredHours == null || waiting > oldestUnansweredHours) {
        oldestUnansweredHours = waiting
      }
    }

    status.set(STATUS_LABEL[ticket.status], (status.get(STATUS_LABEL[ticket.status]) ?? 0) + 1)
    if (!settled) {
      priority.set(
        PRIORITY_LABEL[ticket.priority],
        (priority.get(PRIORITY_LABEL[ticket.priority]) ?? 0) + 1
      )
    }
  }

  const statusOrder = Object.values(STATUS_LABEL)
  const priorityOrder = ["Urgent", "High", "Normal", "Low"]

  return {
    total: tickets.length,
    needsUs,
    waitingOnClient,
    resolved,
    closed,
    overdue,
    unassigned,
    urgent,
    openedThisWeek,
    resolvedThisWeek,
    medianFirstResponseHours: median(responseHours),
    oldestUnansweredHours,
    byStatus: statusOrder
      .map((label) => ({ label, value: status.get(label) ?? 0 }))
      .filter((s) => s.value > 0),
    byPriority: priorityOrder
      .map((label) => ({ label, value: priority.get(label) ?? 0 }))
      .filter((p) => p.value > 0),
  }
}

/**
 * A duration in hours, read the way someone would say it.
 *
 * Rounded to whole units deliberately: "2.4 days" is a number pretending to a
 * precision that a support queue does not have.
 */
export function describeHours(hours: number | null): string {
  if (hours == null) return "—"
  if (hours < 1) return "under an hour"
  if (hours < 24) {
    const h = Math.round(hours)
    return `${h} hour${h === 1 ? "" : "s"}`
  }
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"}`
}

/** TKT-014. Padded so a list of them lines up. */
export function ticketRef(number: number): string {
  return `TKT-${String(number).padStart(3, "0")}`
}
