import { describe, expect, it } from "vitest"

import { OVERHEAD_LABEL, summariseExpenses, type ExpenseLike } from "./expense-summary"

/**
 * These tests exist for one clause of the brief: a report must distinguish
 * project cost from company overhead, and aggregating by project and by
 * department must not double-count. Both are properties of the summing, so
 * they are asserted here rather than trusted to a comment.
 */

const NOW = new Date("2026-10-11T12:00:00Z")

function expense(partial: Partial<ExpenseLike> = {}): ExpenseLike {
  return {
    amount: 1000,
    currency: "INR",
    category: "Software & Tools",
    spentOn: new Date("2026-10-05T00:00:00Z"),
    vendor: null,
    status: "PAID",
    scope: "OVERHEAD",
    recurrence: "ONE_OFF",
    projectTitle: null,
    departmentName: null,
    ...partial,
  }
}

const sum = (parts: { value: number }[]) => parts.reduce((acc, p) => acc + p.value, 0)

describe("summariseExpenses", () => {
  it("splits project cost from overhead without overlap", () => {
    const stats = summariseExpenses(
      [
        expense({ amount: 500, scope: "PROJECT", projectTitle: "Website" }),
        expense({ amount: 300, scope: "PROJECT", projectTitle: "Website" }),
        expense({ amount: 200, scope: "OVERHEAD" }),
      ],
      "INR",
      NOW
    )

    expect(stats.projectTotal).toBe(800)
    expect(stats.overheadTotal).toBe(200)
    // The point of the scope column: the two halves are the whole.
    expect(stats.projectTotal + stats.overheadTotal).toBe(stats.total)
  })

  it("does not double-count when the same money is viewed by project and by department", () => {
    // One expense is BOTH a project cost and a department's spend. A naive
    // aggregation that treats those as separate buckets inflates the total.
    const rows = [
      expense({ amount: 1200, scope: "PROJECT", projectTitle: "Website", departmentName: "Design" }),
      expense({ amount: 800, scope: "OVERHEAD", departmentName: "Design" }),
      expense({ amount: 400, scope: "PROJECT", projectTitle: "App", departmentName: "Engineering" }),
    ]
    const stats = summariseExpenses(rows, "INR", NOW)

    expect(stats.total).toBe(2400)
    expect(sum(stats.byProject)).toBe(2400)
    expect(sum(stats.byDepartment)).toBe(2400)
    expect(sum(stats.byCategory)).toBe(2400)
    expect(sum(stats.byStatus)).toBe(2400)
  })

  it("names overhead in the project breakdown rather than dropping it", () => {
    const stats = summariseExpenses(
      [
        expense({ amount: 600, scope: "PROJECT", projectTitle: "Website" }),
        expense({ amount: 400, scope: "OVERHEAD" }),
      ],
      "INR",
      NOW
    )

    const overhead = stats.byProject.find((p) => p.label === OVERHEAD_LABEL)
    expect(overhead?.value).toBe(400)
    expect(sum(stats.byProject)).toBe(stats.total)
  })

  it("keeps a project cost whose project was deleted in the totals", () => {
    const stats = summariseExpenses(
      [expense({ amount: 700, scope: "PROJECT", projectTitle: null })],
      "INR",
      NOW
    )

    expect(stats.projectTotal).toBe(700)
    expect(stats.byProject).toEqual([{ label: "Project removed", value: 700 }])
  })

  it("buckets an expense with no department as Unassigned, not nowhere", () => {
    const stats = summariseExpenses([expense({ amount: 250 })], "INR", NOW)
    expect(stats.byDepartment).toEqual([{ label: "Unassigned", value: 250 }])
  })

  it("ignores other currencies, and counts only what it totalled", () => {
    const stats = summariseExpenses(
      [expense({ amount: 1000 }), expense({ amount: 99, currency: "USD" })],
      "INR",
      NOW
    )

    expect(stats.total).toBe(1000)
    // A "2 transactions" caption under a one-transaction figure is a lie.
    expect(stats.transactionCount).toBe(1)
  })

  it("separates this month from last, and does not count one twice", () => {
    const stats = summariseExpenses(
      [
        expense({ amount: 100, spentOn: new Date("2026-10-01T00:00:00Z") }),
        expense({ amount: 200, spentOn: new Date("2026-09-30T23:00:00Z") }),
        expense({ amount: 400, spentOn: new Date("2026-08-15T00:00:00Z") }),
      ],
      "INR",
      NOW
    )

    expect(stats.thisMonth).toBe(100)
    expect(stats.previousMonth).toBe(200)
    expect(stats.thisMonth + stats.previousMonth).toBeLessThan(stats.total)
  })

  it("counts the rolling week from seven days back, not from Monday", () => {
    const stats = summariseExpenses(
      [
        // Six days ago - inside a rolling week, but a Monday-start week
        // beginning 2026-10-12 would have excluded it.
        expense({ amount: 150, spentOn: new Date("2026-10-05T12:00:00Z") }),
        expense({ amount: 999, spentOn: new Date("2026-10-01T12:00:00Z") }),
      ],
      "INR",
      NOW
    )

    expect(stats.thisWeek).toBe(150)
  })

  it("expresses recurring costs as a monthly commitment", () => {
    const stats = summariseExpenses(
      [
        expense({ amount: 1000, recurrence: "MONTHLY" }),
        expense({ amount: 3000, recurrence: "QUARTERLY" }),
        expense({ amount: 12_000, recurrence: "YEARLY" }),
        expense({ amount: 5000, recurrence: "ONE_OFF" }),
      ],
      "INR",
      NOW
    )

    expect(stats.recurringMonthly).toBe(3000)
    // The one-off is spend, but it is not a commitment.
    expect(stats.recurringCount).toBe(3)
  })

  it("totals only unsettled statuses as pending", () => {
    const stats = summariseExpenses(
      [
        expense({ amount: 100, status: "PAID" }),
        expense({ amount: 200, status: "PENDING" }),
        expense({ amount: 300, status: "PARTIALLY_PAID" }),
        expense({ amount: 400, status: "OVERDUE" }),
      ],
      "INR",
      NOW
    )

    expect(stats.pendingTotal).toBe(900)
    expect(stats.pendingCount).toBe(3)
  })

  it("averages over the months that had spending, not over six", () => {
    const stats = summariseExpenses(
      [
        expense({ amount: 1000, spentOn: new Date("2026-10-02T00:00:00Z") }),
        expense({ amount: 3000, spentOn: new Date("2026-09-02T00:00:00Z") }),
      ],
      "INR",
      NOW
    )

    // 4000 across two months of trading, not 667 across six.
    expect(stats.averageMonthly).toBe(2000)
  })

  it("returns a six-month trend with empty months present and in order", () => {
    const stats = summariseExpenses([], "INR", NOW)

    expect(stats.trend.map((m) => m.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct"])
    expect(stats.trend.every((m) => m.total === 0)).toBe(true)
    expect(stats.averageMonthly).toBe(0)
  })

  it("counts a vendor once however it was typed", () => {
    const stats = summariseExpenses(
      [
        expense({ vendor: "Google" }),
        expense({ vendor: " google " }),
        expense({ vendor: "  " }),
        expense({ vendor: null }),
      ],
      "INR",
      NOW
    )

    expect(stats.vendorCount).toBe(1)
  })

  it("survives having nothing at all", () => {
    const stats = summariseExpenses([], "INR", NOW)

    expect(stats.total).toBe(0)
    expect(stats.transactionCount).toBe(0)
    expect(stats.byProject).toEqual([])
    expect(stats.byDepartment).toEqual([])
  })
})
