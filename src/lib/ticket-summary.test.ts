import { describe, expect, it } from "vitest"

import { describeHours, summariseTickets, ticketRef, type TicketLike } from "./ticket-summary"

/**
 * The invariant: a ticket is in exactly one status, so the counts are disjoint
 * and sum to the total. "Needs us" must never include one that is waiting on
 * the client - that is the distinction the module exists for.
 */

const NOW = new Date("2026-10-11T12:00:00Z")

function ticket(partial: Partial<TicketLike> = {}): TicketLike {
  return {
    status: "OPEN",
    priority: "NORMAL",
    createdAt: new Date("2026-10-10T12:00:00Z"),
    dueAt: null,
    firstRespondedAt: null,
    resolvedAt: null,
    assigneeId: null,
    ...partial,
  }
}

describe("summariseTickets", () => {
  it("keeps waiting-on-client out of the queue that needs us", () => {
    const stats = summariseTickets(
      [
        ticket({ status: "OPEN" }),
        ticket({ status: "IN_PROGRESS" }),
        ticket({ status: "WAITING_ON_CLIENT" }),
        ticket({ status: "RESOLVED" }),
        ticket({ status: "CLOSED" }),
      ],
      NOW
    )

    expect(stats.needsUs).toBe(2)
    expect(stats.waitingOnClient).toBe(1)
    expect(stats.resolved).toBe(1)
    expect(stats.closed).toBe(1)
    // Disjoint and complete.
    expect(stats.needsUs + stats.waitingOnClient + stats.resolved + stats.closed).toBe(stats.total)
  })

  it("does not call a settled ticket overdue", () => {
    const past = new Date("2026-10-01T00:00:00Z")
    const stats = summariseTickets(
      [
        ticket({ status: "RESOLVED", dueAt: past }),
        ticket({ status: "CLOSED", dueAt: past }),
        ticket({ status: "OPEN", dueAt: past }),
      ],
      NOW
    )

    // Only the live one. A resolved ticket cannot become more late.
    expect(stats.overdue).toBe(1)
  })

  it("counts a waiting-on-client ticket as overdue when its promise has passed", () => {
    const stats = summariseTickets(
      [ticket({ status: "WAITING_ON_CLIENT", dueAt: new Date("2026-10-01T00:00:00Z") })],
      NOW
    )

    expect(stats.overdue).toBe(1)
    expect(stats.needsUs).toBe(0)
  })

  it("counts unassigned only among tickets that need us", () => {
    const stats = summariseTickets(
      [
        ticket({ status: "OPEN", assigneeId: null }),
        ticket({ status: "OPEN", assigneeId: "m1" }),
        ticket({ status: "WAITING_ON_CLIENT", assigneeId: null }),
        ticket({ status: "CLOSED", assigneeId: null }),
      ],
      NOW
    )

    expect(stats.unassigned).toBe(1)
  })

  it("counts urgent only among live tickets", () => {
    const stats = summariseTickets(
      [
        ticket({ priority: "URGENT", status: "OPEN" }),
        ticket({ priority: "URGENT", status: "CLOSED" }),
      ],
      NOW
    )

    expect(stats.urgent).toBe(1)
  })

  it("takes the median first response, not the mean", () => {
    const created = new Date("2026-10-10T00:00:00Z")
    const stats = summariseTickets(
      [
        ticket({ createdAt: created, firstRespondedAt: new Date("2026-10-10T01:00:00Z") }),
        ticket({ createdAt: created, firstRespondedAt: new Date("2026-10-10T02:00:00Z") }),
        // One terrible outlier. A mean would read 83 hours; the median holds.
        ticket({ createdAt: created, firstRespondedAt: new Date("2026-10-20T00:00:00Z") }),
      ],
      NOW
    )

    expect(stats.medianFirstResponseHours).toBe(2)
  })

  it("averages the two middles for an even count", () => {
    const created = new Date("2026-10-10T00:00:00Z")
    const stats = summariseTickets(
      [
        ticket({ createdAt: created, firstRespondedAt: new Date("2026-10-10T01:00:00Z") }),
        ticket({ createdAt: created, firstRespondedAt: new Date("2026-10-10T03:00:00Z") }),
      ],
      NOW
    )

    expect(stats.medianFirstResponseHours).toBe(2)
  })

  it("returns null rather than zero when nothing has been answered", () => {
    // Zero would read as "we reply instantly", which is the opposite.
    const stats = summariseTickets([ticket()], NOW)
    expect(stats.medianFirstResponseHours).toBeNull()
  })

  it("reports the longest-waiting unanswered live ticket", () => {
    const stats = summariseTickets(
      [
        ticket({ createdAt: new Date("2026-10-11T06:00:00Z") }), // 6h
        ticket({ createdAt: new Date("2026-10-09T12:00:00Z") }), // 48h
        // Answered, so not waiting.
        ticket({
          createdAt: new Date("2026-10-01T12:00:00Z"),
          firstRespondedAt: new Date("2026-10-01T13:00:00Z"),
        }),
        // Closed without a reply - no longer anybody's problem.
        ticket({ status: "CLOSED", createdAt: new Date("2026-01-01T12:00:00Z") }),
      ],
      NOW
    )

    expect(stats.oldestUnansweredHours).toBe(48)
  })

  it("counts the week by what was opened and what was resolved in it", () => {
    const stats = summariseTickets(
      [
        ticket({ createdAt: new Date("2026-10-09T12:00:00Z") }),
        ticket({ createdAt: new Date("2026-08-01T12:00:00Z") }),
        ticket({
          status: "RESOLVED",
          createdAt: new Date("2026-08-01T12:00:00Z"),
          resolvedAt: new Date("2026-10-10T12:00:00Z"),
        }),
      ],
      NOW
    )

    expect(stats.openedThisWeek).toBe(1)
    expect(stats.resolvedThisWeek).toBe(1)
  })

  it("breaks priority down over live tickets only, most urgent first", () => {
    const stats = summariseTickets(
      [
        ticket({ priority: "LOW" }),
        ticket({ priority: "URGENT" }),
        ticket({ priority: "HIGH" }),
        ticket({ priority: "URGENT", status: "CLOSED" }),
      ],
      NOW
    )

    expect(stats.byPriority).toEqual([
      { label: "Urgent", value: 1 },
      { label: "High", value: 1 },
      { label: "Low", value: 1 },
    ])
  })

  it("survives an empty queue", () => {
    const stats = summariseTickets([], NOW)

    expect(stats.total).toBe(0)
    expect(stats.needsUs).toBe(0)
    expect(stats.medianFirstResponseHours).toBeNull()
    expect(stats.oldestUnansweredHours).toBeNull()
    expect(stats.byStatus).toEqual([])
  })
})

describe("describeHours", () => {
  it("reads the way someone would say it", () => {
    expect(describeHours(null)).toBe("—")
    expect(describeHours(0.4)).toBe("under an hour")
    expect(describeHours(1)).toBe("1 hour")
    expect(describeHours(5.2)).toBe("5 hours")
    expect(describeHours(24)).toBe("1 day")
    expect(describeHours(58)).toBe("2 days")
  })
})

describe("ticketRef", () => {
  it("pads so a column of them lines up", () => {
    expect(ticketRef(1)).toBe("TKT-001")
    expect(ticketRef(14)).toBe("TKT-014")
    expect(ticketRef(1234)).toBe("TKT-1234")
  })
})
