import prisma from "@/lib/db"

import { summariseExpenses, type ExpenseStats } from "@/lib/expense-summary"

/**
 * The database half of the Expenses figures.
 *
 * Only the query lives here. Every rule about what the numbers mean - the
 * project/overhead split, the breakdowns that must not double-count - is in
 * expense-summary.ts, which is pure and therefore unit tested. Splitting them
 * is the repo's convention for exactly that reason: `npm test` runs anywhere,
 * with no database and no secrets.
 */

export type {
  ExpenseBreakdown,
  ExpenseLike,
  ExpenseMonth,
  ExpenseStats,
} from "@/lib/expense-summary"
export { OVERHEAD_LABEL, summariseExpenses } from "@/lib/expense-summary"

export async function getExpenseStats(userId: string, now = new Date()): Promise<ExpenseStats> {
  const [profile, expenses] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId }, select: { currency: true } }),
    prisma.expense.findMany({
      where: { userId, archivedAt: null },
      select: {
        amount: true,
        currency: true,
        category: true,
        spentOn: true,
        vendor: true,
        status: true,
        scope: true,
        recurrence: true,
        project: { select: { title: true } },
        department: { select: { name: true } },
      },
    }),
  ])

  return summariseExpenses(
    expenses.map((expense) => ({
      amount: Number(expense.amount),
      currency: expense.currency,
      category: expense.category,
      spentOn: expense.spentOn,
      vendor: expense.vendor,
      status: expense.status,
      scope: expense.scope,
      recurrence: expense.recurrence,
      projectTitle: expense.project?.title ?? null,
      departmentName: expense.department?.name ?? null,
    })),
    profile?.currency || "INR",
    now
  )
}
