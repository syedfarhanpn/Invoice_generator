import { describe, expect, it } from "vitest"

import { beganAt, projectTrend, type TrendProject } from "@/lib/project-trend"

const NOW = new Date("2026-06-15T10:00:00Z")

function project(overrides: Partial<TrendProject> = {}): TrendProject {
  return {
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    startedAt: null,
    terminal: false,
    won: false,
    ...overrides,
  }
}

describe("beganAt", () => {
  it("prefers the recorded start over the row's creation", () => {
    const row = project({
      startedAt: new Date("2026-03-04T00:00:00Z"),
      createdAt: new Date("2026-05-09T00:00:00Z"),
    })
    expect(beganAt(row).toISOString()).toBe("2026-03-04T00:00:00.000Z")
  })

  it("falls back to creation when nothing was recorded", () => {
    const row = project({ createdAt: new Date("2026-05-09T00:00:00Z") })
    expect(beganAt(row).toISOString()).toBe("2026-05-09T00:00:00.000Z")
  })
})

describe("projectTrend", () => {
  it("returns six months ending with the current one", () => {
    const months = projectTrend([], NOW)
    expect(months.map((m) => m.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun"])
  })

  it("counts a start in the month it began, not the month it was created", () => {
    const months = projectTrend(
      [
        project({
          startedAt: new Date("2026-02-20T00:00:00Z"),
          createdAt: new Date("2026-05-01T00:00:00Z"),
        }),
      ],
      NOW
    )
    expect(months.find((m) => m.label === "Feb")!.started).toBe(1)
    expect(months.find((m) => m.label === "May")!.started).toBe(0)
  })

  it("keeps a long-running project in every bar after it began", () => {
    const months = projectTrend(
      [project({ createdAt: new Date("2026-03-02T00:00:00Z") })],
      NOW
    )
    expect(months.map((m) => m.inProgress)).toEqual([0, 0, 1, 1, 1, 1])
  })

  it("drops a project from in-progress once it is delivered", () => {
    const months = projectTrend(
      [
        project({
          createdAt: new Date("2026-02-01T00:00:00Z"),
          updatedAt: new Date("2026-04-20T00:00:00Z"),
          terminal: true,
          won: true,
        }),
      ],
      NOW
    )
    expect(months.map((m) => m.inProgress)).toEqual([0, 1, 1, 0, 0, 0])
    expect(months.map((m) => m.completed)).toEqual([0, 0, 0, 1, 0, 0])
  })

  it("counts a dropped project as closed without counting it as completed", () => {
    const months = projectTrend(
      [
        project({
          createdAt: new Date("2026-01-05T00:00:00Z"),
          updatedAt: new Date("2026-03-09T00:00:00Z"),
          terminal: true,
          won: false,
        }),
      ],
      NOW
    )
    expect(months.map((m) => m.inProgress)).toEqual([1, 1, 0, 0, 0, 0])
    expect(months.every((m) => m.completed === 0)).toBe(true)
  })

  it("ignores anything that began after the window", () => {
    const months = projectTrend(
      [project({ createdAt: new Date("2026-09-01T00:00:00Z") })],
      NOW
    )
    expect(months.every((m) => m.started === 0 && m.inProgress === 0)).toBe(true)
  })

  it("leaves nothing out of the last bar that is still open today", () => {
    const rows = [
      project({ createdAt: new Date("2026-01-01T00:00:00Z") }),
      project({ createdAt: new Date("2026-06-14T00:00:00Z") }),
      project({
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-06-02T00:00:00Z"),
        terminal: true,
        won: true,
      }),
    ]
    expect(projectTrend(rows, NOW).at(-1)!.inProgress).toBe(2)
  })

  it("crosses a year boundary without losing a month", () => {
    const months = projectTrend([], new Date("2026-02-10T00:00:00Z"))
    expect(months.map((m) => m.label)).toEqual(["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"])
  })
})
