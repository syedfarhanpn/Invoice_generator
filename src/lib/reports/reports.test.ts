import { describe, expect, it } from "vitest"

import { resolveRange } from "@/lib/report-range"

import { summariseClients, type ClientRow } from "./clients"
import { summariseProjects, type ProjectRow } from "./projects"
import { summariseSales, type SalesLead } from "./sales"

const NOW = new Date("2026-10-11T12:00:00Z")
const RANGE = resolveRange("thisYear", NOW)

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

function lead(partial: Partial<SalesLead> = {}): SalesLead {
  return {
    id: "l1",
    title: "A lead",
    value: 10_000,
    currency: "INR",
    source: "Website",
    createdAt: new Date("2026-05-01T00:00:00Z"),
    closedAt: null,
    stageName: "New",
    stageType: "OPEN",
    stagePosition: 0,
    clientName: null,
    ownerId: null,
    ownerName: null,
    hasOpenTask: false,
    ...partial,
  }
}

describe("summariseSales", () => {
  it("counts conversion over every lead taken on, not only closed ones", () => {
    // Four leads, one won, nothing lost. won/closed would say 100%.
    const leads = [
      lead({ id: "a", stageType: "WON", stagePosition: 3 }),
      lead({ id: "b" }),
      lead({ id: "c" }),
      lead({ id: "d" }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    expect(report.conversionRate).toBe(25)
  })

  it("treats anything past the first column as qualified", () => {
    const leads = [
      lead({ id: "a", stagePosition: 0 }),
      lead({ id: "b", stagePosition: 1 }),
      lead({ id: "c", stagePosition: 2, stageType: "WON" }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    expect(report.qualified).toBe(2)
  })

  it("builds a funnel that cannot widen as it descends", () => {
    const leads = [
      lead({ id: "a", stagePosition: 0 }),
      lead({ id: "b", stagePosition: 1 }),
      lead({ id: "c", stagePosition: 2, stageType: "WON" }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    const values = report.funnel.map((f) => f.value)
    expect(values).toEqual([3, 2, 1])
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1])
    }
    expect(report.funnel[0].share).toBe(1)
  })

  it("keeps pipeline value and won value apart", () => {
    const leads = [
      lead({ id: "a", stageType: "OPEN", value: 5_000 }),
      lead({ id: "b", stageType: "WON", value: 8_000, stagePosition: 3 }),
      // A lost deal is in neither.
      lead({ id: "c", stageType: "LOST", value: 99_000, stagePosition: 4 }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    expect(report.pipelineValue).toBe(5_000)
    expect(report.wonValue).toBe(8_000)
  })

  it("averages deal value over won deals, not over every lead", () => {
    const leads = [
      lead({ id: "a", stageType: "WON", value: 10_000, stagePosition: 3 }),
      lead({ id: "b", stageType: "OPEN", value: 10_000 }),
      lead({ id: "c", stageType: "LOST", value: 10_000, stagePosition: 4 }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    // 10,000 - the average WON deal. Not 10,000/3.
    expect(report.averageDealValue).toBe(10_000)
  })

  it("counts a lost lead in another currency, which the reduces never visit", () => {
    const leads = [
      lead({ id: "a", stageType: "LOST", currency: "USD", value: 500, stagePosition: 4 }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    expect(report.otherCurrencyCount).toBe(1)
  })

  it("gives unassigned leads their own row rather than dropping them", () => {
    const leads = [
      lead({ id: "a", ownerId: "m1", ownerName: "Farhan", stageType: "WON", stagePosition: 3 }),
      lead({ id: "b", ownerId: null }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    expect(report.salespeople.map((s) => s.name)).toContain("Unassigned")
    expect(report.salespeople.reduce((n, s) => n + s.taken, 0)).toBe(2)
  })

  it("scores each salesperson over their own leads", () => {
    const leads = [
      lead({ id: "a", ownerId: "m1", ownerName: "Farhan", stageType: "WON", stagePosition: 3, value: 4_000 }),
      lead({ id: "b", ownerId: "m1", ownerName: "Farhan", stageType: "LOST", stagePosition: 4 }),
      lead({ id: "c", ownerId: "m2", ownerName: "Sam" }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    const farhan = report.salespeople.find((s) => s.name === "Farhan")!
    expect(farhan.taken).toBe(2)
    expect(farhan.conversionRate).toBe(50)
    expect(farhan.wonValue).toBe(4_000)

    const sam = report.salespeople.find((s) => s.name === "Sam")!
    expect(sam.conversionRate).toBe(0)
  })

  it("orders stages by board position, not by size", () => {
    const leads = [
      lead({ id: "a", stageName: "Won", stagePosition: 3, stageType: "WON" }),
      lead({ id: "b", stageName: "New", stagePosition: 0 }),
      lead({ id: "c", stageName: "New", stagePosition: 0 }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    expect(report.byStage.map((s) => s.label)).toEqual(["New", "Won"])
  })

  it("counts an open lead with no next action as stalled", () => {
    const leads = [
      lead({ id: "a", hasOpenTask: false }),
      lead({ id: "b", hasOpenTask: true }),
      // A won deal needs no next action.
      lead({ id: "c", stageType: "WON", hasOpenTask: false, stagePosition: 3 }),
    ]
    const report = summariseSales(leads, [], "INR", RANGE)

    expect(report.stalled).toBe(1)
  })

  it("survives having no leads at all", () => {
    const report = summariseSales([], [], "INR", RANGE)

    expect(report.total).toBe(0)
    expect(report.conversionRate).toBe(0)
    expect(report.averageDealValue).toBe(0)
    expect(report.funnel.every((f) => f.value === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function client(partial: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "c1",
    name: "Acme",
    industry: "Retail",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    archivedAt: null,
    projects: 1,
    activeProjects: 1,
    revenue: 10_000,
    outstanding: 0,
    documents: 2,
    lastActivityAt: null,
    ...partial,
  }
}

describe("summariseClients", () => {
  it("calls a client active on live work, not on when they were created", () => {
    const rows = [
      client({ id: "a", createdAt: new Date("2019-01-01T00:00:00Z"), activeProjects: 1 }),
      client({ id: "b", activeProjects: 0, outstanding: 0, revenue: 0 }),
      // No live project, but still owes money.
      client({ id: "c", activeProjects: 0, outstanding: 5_000 }),
    ]
    const report = summariseClients(rows, 0, "INR", RANGE)

    expect(report.active).toBe(2)
    expect(report.inactive).toBe(1)
    expect(report.active + report.inactive).toBe(report.total)
  })

  it("keeps archived clients out of the live total", () => {
    const rows = [
      client({ id: "a" }),
      client({ id: "b", archivedAt: new Date("2026-06-01T00:00:00Z") }),
    ]
    const report = summariseClients(rows, 0, "INR", RANGE)

    expect(report.total).toBe(1)
    expect(report.archived).toBe(1)
  })

  it("averages revenue over clients who have actually paid", () => {
    const rows = [
      client({ id: "a", revenue: 10_000 }),
      client({ id: "b", revenue: 0 }),
      client({ id: "c", revenue: 0 }),
    ]
    const report = summariseClients(rows, 0, "INR", RANGE)

    // 10,000 from the one paying client - not 3,333 across three.
    expect(report.averageRevenue).toBe(10_000)
  })

  it("draws growth as a running total so a quiet month is not a fall", () => {
    const rows = [
      client({ id: "a", createdAt: new Date("2026-01-10T00:00:00Z") }),
      client({ id: "b", createdAt: new Date("2026-02-10T00:00:00Z") }),
      // Nothing in March.
      client({ id: "c", createdAt: new Date("2026-04-10T00:00:00Z") }),
    ]
    const report = summariseClients(rows, 0, "INR", resolveRange("custom", NOW, {
      from: "2026-01-01",
      to: "2026-04-30",
    }))

    expect(report.growth.map((g) => g.total)).toEqual([1, 2, 2, 3])
  })

  it("counts only clients created inside the range as added", () => {
    const rows = [
      client({ id: "a", createdAt: new Date("2026-05-01T00:00:00Z") }),
      client({ id: "b", createdAt: new Date("2025-05-01T00:00:00Z") }),
    ]
    const report = summariseClients(rows, 0, "INR", RANGE)

    expect(report.added).toBe(1)
    expect(report.total).toBe(2)
  })

  it("ranks top clients by what they paid, not by what they were billed", () => {
    const rows = [
      client({ id: "payer", name: "Payer", revenue: 50_000, outstanding: 0 }),
      client({ id: "debtor", name: "Debtor", revenue: 1_000, outstanding: 200_000 }),
    ]
    const report = summariseClients(rows, 0, "INR", RANGE)

    expect(report.topByRevenue[0].name).toBe("Payer")
  })

  it("bands clients by project count without losing any", () => {
    const rows = [
      client({ id: "a", projects: 0, activeProjects: 0, revenue: 0 }),
      client({ id: "b", projects: 1 }),
      client({ id: "c", projects: 3 }),
      client({ id: "d", projects: 9 }),
    ]
    const report = summariseClients(rows, 0, "INR", RANGE)

    expect(report.byProjectCount.reduce((n, b) => n + b.value, 0)).toBe(4)
  })

  it("survives having no clients", () => {
    const report = summariseClients([], 0, "INR", RANGE)
    expect(report.total).toBe(0)
    expect(report.averageRevenue).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function project(partial: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "p1",
    title: "A project",
    clientName: "Acme",
    category: "Website",
    stageName: "Working",
    stageType: "OPEN",
    stagePosition: 1,
    value: 50_000,
    currency: "INR",
    progress: 50,
    startedAt: new Date("2026-06-01T00:00:00Z"),
    deadline: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-10-10T00:00:00Z"),
    managerId: null,
    managerName: null,
    openTasks: 0,
    ...partial,
  }
}

describe("summariseProjects", () => {
  it("takes status from the board's stage type", () => {
    const rows = [
      project({ id: "a", stageType: "OPEN" }),
      project({ id: "b", stageType: "WON" }),
      project({ id: "c", stageType: "LOST" }),
    ]
    const report = summariseProjects(rows, 0, "INR", RANGE, NOW)

    expect(report.active).toBe(1)
    expect(report.delivered).toBe(1)
    expect(report.dropped).toBe(1)
    expect(report.active + report.delivered + report.dropped).toBe(report.total)
  })

  it("reports a started project untouched for a month as stalled", () => {
    const rows = [
      project({ id: "a", updatedAt: new Date("2026-08-01T00:00:00Z") }),
      project({ id: "b", updatedAt: new Date("2026-10-10T00:00:00Z") }),
      // Never started, so not stalled - it has not begun.
      project({ id: "c", startedAt: null, updatedAt: new Date("2026-01-01T00:00:00Z") }),
      // Delivered projects do not go stale.
      project({ id: "d", stageType: "WON", updatedAt: new Date("2026-01-01T00:00:00Z") }),
    ]
    const report = summariseProjects(rows, 0, "INR", RANGE, NOW)

    expect(report.stalled).toBe(1)
  })

  it("counts late only against work still open", () => {
    const past = new Date("2026-09-01T00:00:00Z")
    const rows = [
      project({ id: "a", deadline: past }),
      // Delivered after its deadline is not late any more; it is done.
      project({ id: "b", stageType: "WON", deadline: past }),
      project({ id: "c", deadline: new Date("2027-01-01T00:00:00Z") }),
    ]
    const report = summariseProjects(rows, 0, "INR", RANGE, NOW)

    expect(report.late).toBe(1)
  })

  it("averages progress only over projects that record one", () => {
    const rows = [
      project({ id: "a", progress: 80 }),
      project({ id: "b", progress: null }),
      project({ id: "c", progress: 60 }),
    ]
    const report = summariseProjects(rows, 0, "INR", RANGE, NOW)

    // 70, not 47 - an unset progress is unknown, not zero.
    expect(report.averageProgress).toBe(70)
  })

  it("returns null progress rather than zero when nobody records it", () => {
    const report = summariseProjects([project({ progress: null })], 0, "INR", RANGE, NOW)
    expect(report.averageProgress).toBeNull()
  })

  it("keeps value in flight apart from value delivered", () => {
    const rows = [
      project({ id: "a", stageType: "OPEN", value: 30_000 }),
      project({ id: "b", stageType: "WON", value: 70_000 }),
    ]
    const report = summariseProjects(rows, 0, "INR", RANGE, NOW)

    expect(report.valueInFlight).toBe(30_000)
    expect(report.deliveredValue).toBe(70_000)
  })

  it("names projects with no client rather than dropping them", () => {
    const rows = [project({ id: "a", clientName: null }), project({ id: "b", clientName: "Acme" })]
    const report = summariseProjects(rows, 0, "INR", RANGE, NOW)

    expect(report.byClient.find((c) => c.label === "No client")?.value).toBe(1)
    expect(report.byClient.reduce((n, c) => n + c.value, 0)).toBe(2)
  })

  it("gives unmanaged projects a workload row", () => {
    const rows = [
      project({ id: "a", managerId: "m1", managerName: "Farhan", openTasks: 3 }),
      project({ id: "b", managerId: null, openTasks: 2 }),
    ]
    const report = summariseProjects(rows, 0, "INR", RANGE, NOW)

    expect(report.workload.map((w) => w.name)).toContain("Nobody assigned")
    expect(report.unmanaged).toBe(1)
  })

  it("lists upcoming deadlines soonest first", () => {
    const rows = [
      project({ id: "a", deadline: new Date("2027-03-01T00:00:00Z") }),
      project({ id: "b", deadline: new Date("2026-11-01T00:00:00Z") }),
      project({ id: "c", deadline: null }),
    ]
    const report = summariseProjects(rows, 0, "INR", RANGE, NOW)

    expect(report.upcoming.map((p) => p.id)).toEqual(["b", "a"])
  })

  it("survives having no projects", () => {
    const report = summariseProjects([], 0, "INR", RANGE, NOW)
    expect(report.total).toBe(0)
    expect(report.averageProgress).toBeNull()
    expect(report.byStatus).toEqual([])
  })
})
