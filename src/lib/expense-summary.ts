import type { ExpenseRecurrence, ExpenseScope, ExpenseStatus } from "@prisma/client"

/**
 * The figures behind the Expenses screen.
 *
 * The brief is explicit that a report must distinguish project costs from
 * company overhead and must not double-count when aggregating by project and
 * by department. That is why scope is a discriminator on the row rather than
 * an inference from a null projectId: the two totals below are disjoint by
 * construction, and summing them gives the whole.
 *
 * The aggregation is a pure function over flat rows, separate from the query,
 * so those invariants can be asserted in a test rather than asserted in a
 * comment. `getExpenseStats` is the thin database half.
 */

export type ExpenseBreakdown = { label: string; value: number }
export type ExpenseMonth = { label: string; total: number }

/** One expense, flattened - relations arrive as names, not objects. */
export type ExpenseLike = {
  amount: number
  currency: string
  category: string
  spentOn: Date
  vendor: string | null
  status: ExpenseStatus
  scope: ExpenseScope
  recurrence: ExpenseRecurrence
  projectTitle: string | null
  departmentName: string | null
}

export type ExpenseStats = {
  currency: string
  total: number
  thisMonth: number
  previousMonth: number
  thisWeek: number
  /** Disjoint by construction - see the note above. */
  projectTotal: number
  overheadTotal: number
  vendorCount: number
  pendingTotal: number
  pendingCount: number
  transactionCount: number
  averageMonthly: number
  byCategory: ExpenseBreakdown[]
  byDepartment: ExpenseBreakdown[]
  byProject: ExpenseBreakdown[]
  byStatus: ExpenseBreakdown[]
  trend: ExpenseMonth[]
  recurringMonthly: number
  recurringCount: number
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })

/** The label a project-wise view gives money that no project carries. */
export const OVERHEAD_LABEL = "Company overhead"

/** Shown when a project was removed but its costs remain on the books. */
const ORPHANED_LABEL = "Project removed"

/** Where an expense with no department lands, so the parts still sum. */
const UNASSIGNED_LABEL = "Unassigned"

function monthStart(now: Date, back: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/** A recurring cost expressed as what it works out to per month. */
function monthlyEquivalent(amount: number, recurrence: ExpenseRecurrence): number {
  switch (recurrence) {
    case "MONTHLY":
      return amount
    case "QUARTERLY":
      return amount / 3
    case "YEARLY":
      return amount / 12
    case "ONE_OFF":
      return 0
  }
}

const UNSETTLED: ExpenseStatus[] = ["PENDING", "PARTIALLY_PAID", "OVERDUE"]

/**
 * Every figure on the Expenses screen, from flat rows.
 *
 * Pure, and deliberately single-pass: each expense contributes to each
 * breakdown exactly once, which is what makes "by project" and "by department"
 * two views of the same money rather than two counts of it.
 */
export function summariseExpenses(
  expenses: ExpenseLike[],
  currency: string,
  now = new Date()
): ExpenseStats {
  const thisMonth = monthStart(now, 0)
  const lastMonth = monthStart(now, 1)
  const sixBack = monthStart(now, 5)
  // Seven days back, not "since Monday": a rolling week is what you have
  // actually spent lately, which is the question this card answers.
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000)

  let total = 0
  let thisMonthTotal = 0
  let previousMonthTotal = 0
  let thisWeekTotal = 0
  let projectTotal = 0
  let overheadTotal = 0
  let pendingTotal = 0
  let pendingCount = 0
  let recurringMonthly = 0
  let recurringCount = 0
  let counted = 0

  const vendors = new Set<string>()
  const category = new Map<string, number>()
  const department = new Map<string, number>()
  const project = new Map<string, number>()
  const status = new Map<string, number>()
  const monthly = new Map<string, number>()

  for (const expense of expenses) {
    // Totals only mean anything inside one currency, as elsewhere in the app.
    if (expense.currency !== currency) continue
    const amount = Number(expense.amount)
    total += amount
    counted += 1

    if (expense.spentOn >= thisMonth) thisMonthTotal += amount
    else if (expense.spentOn >= lastMonth) previousMonthTotal += amount
    if (expense.spentOn >= weekAgo) thisWeekTotal += amount

    if (expense.scope === "PROJECT") projectTotal += amount
    else overheadTotal += amount

    if (UNSETTLED.includes(expense.status)) {
      pendingTotal += amount
      pendingCount += 1
    }

    if (expense.recurrence !== "ONE_OFF") {
      recurringMonthly += monthlyEquivalent(amount, expense.recurrence)
      recurringCount += 1
    }

    if (expense.vendor?.trim()) vendors.add(expense.vendor.trim().toLowerCase())

    const cat = expense.category.trim() || "Uncategorised"
    category.set(cat, (category.get(cat) ?? 0) + amount)

    const dep = expense.departmentName?.trim() || UNASSIGNED_LABEL
    department.set(dep, (department.get(dep) ?? 0) + amount)

    // Overhead is named explicitly rather than dropped, so a project-wise
    // view still accounts for every rupee and the parts sum to the whole.
    const proj =
      expense.scope === "PROJECT"
        ? expense.projectTitle?.trim() || ORPHANED_LABEL
        : OVERHEAD_LABEL
    project.set(proj, (project.get(proj) ?? 0) + amount)

    status.set(expense.status, (status.get(expense.status) ?? 0) + amount)

    if (expense.spentOn >= sixBack) {
      const key = monthKey(expense.spentOn)
      monthly.set(key, (monthly.get(key) ?? 0) + amount)
    }
  }

  const trend: ExpenseMonth[] = Array.from({ length: 6 }, (_, i) => {
    const date = monthStart(now, 5 - i)
    return { label: MONTH_LABEL.format(date), total: monthly.get(monthKey(date)) ?? 0 }
  })

  const months = trend.filter((m) => m.total > 0).length

  const sorted = (map: Map<string, number>): ExpenseBreakdown[] =>
    [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

  return {
    currency,
    total,
    thisMonth: thisMonthTotal,
    previousMonth: previousMonthTotal,
    thisWeek: thisWeekTotal,
    projectTotal,
    overheadTotal,
    vendorCount: vendors.size,
    pendingTotal,
    pendingCount,
    // The rows that actually fed the totals. Counting every row would caption
    // a figure with transactions it does not include.
    transactionCount: counted,
    // Averaged over months that had spending, not over six: a business two
    // months old is not averaging its costs across four empty ones.
    averageMonthly: months > 0 ? trend.reduce((sum, m) => sum + m.total, 0) / months : 0,
    byCategory: sorted(category),
    byDepartment: sorted(department),
    byProject: sorted(project),
    byStatus: sorted(status),
    trend,
    recurringMonthly,
    recurringCount,
  }
}
