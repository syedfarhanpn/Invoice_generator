import { requirePermission } from "@/lib/access"
import { DonutChart } from "@/components/app/donut-chart"
import { PageHeader } from "@/components/app/page-header"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { TrendChart } from "@/components/app/trend-chart"
import { formatShortDay } from "@/lib/dates"
import prisma from "@/lib/db"
import { DEFAULT_CATEGORIES } from "@/lib/expense-categories"
import { getExpenseStats, OVERHEAD_LABEL } from "@/lib/expense-stats"
import { formatAmount, formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { ExpensesTable, type ExpenseRow, type Option } from "./expenses-table"

export const metadata = { title: "Expenses" }

/**
 * Expenses.
 *
 * The split that matters is project cost versus company overhead. It is a
 * column on the row, not an inference, so the two totals below are disjoint
 * and add up to the whole - which is what lets a project-wise view and a
 * department-wise view of the same money both be correct.
 */
export default async function ExpensesPage() {
  // Server-side, before any query runs. Hiding the nav entry is not
  // access control; this is.
  await requirePermission("expenses", "read")

  const identity = await getWorkspaceIdentity()
  const userId = identity.userId

  const [stats, expenses, projects, departments] = await Promise.all([
    getExpenseStats(userId),
    prisma.expense.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ spentOn: "desc" }],
      select: {
        id: true,
        title: true,
        category: true,
        amount: true,
        spentOn: true,
        vendor: true,
        paymentMethod: true,
        status: true,
        scope: true,
        projectId: true,
        departmentId: true,
        recurrence: true,
        notes: true,
        project: { select: { title: true } },
        department: { select: { name: true } },
      },
    }),
    prisma.project.findMany({
      where: { userId, archivedAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    identity.orgId
      ? prisma.department.findMany({
          where: { orgId: identity.orgId },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  const { currency } = stats

  const rows: ExpenseRow[] = expenses.map((expense) => ({
    id: expense.id,
    title: expense.title,
    category: expense.category,
    amount: Number(expense.amount),
    spentOn: expense.spentOn.toISOString().slice(0, 10),
    spentOnLabel: formatShortDay(expense.spentOn),
    vendor: expense.vendor,
    paymentMethod: expense.paymentMethod,
    status: expense.status,
    scope: expense.scope,
    projectId: expense.projectId,
    projectTitle: expense.project?.title ?? null,
    departmentId: expense.departmentId,
    departmentName: expense.department?.name ?? null,
    recurrence: expense.recurrence,
    notes: expense.notes,
  }))

  const projectOptions: Option[] = projects.map((p) => ({ id: p.id, label: p.title }))
  const departmentOptions: Option[] = departments.map((d) => ({ id: d.id, label: d.name }))

  // Categories the operator already uses come first; the defaults fill in the
  // rest, so the suggestion list reflects their business rather than ours.
  const categories = [
    ...new Set([...stats.byCategory.map((c) => c.label), ...DEFAULT_CATEGORIES]),
  ].filter((c) => c !== "Uncategorised")

  const monthChange = percentChange(stats.thisMonth, stats.previousMonth)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Expenses" trail={[{ label: "Expenses" }]} />

      <StatRow>
        <StatCard
          label="Spent this month"
          value={stats.thisMonth}
          format="compactCurrency"
          currency={currency}
          icon="money"
          delta={
            monthChange == null
              ? undefined
              : {
                  label: formatDelta(monthChange),
                  direction: monthChange >= 0 ? "up" : "down",
                  caption: "vs last month",
                  // More spending is not good news, so the colours invert.
                  inverted: true,
                }
          }
        />
        <StatCard
          label="All time"
          value={stats.total}
          format="compactCurrency"
          currency={currency}
          icon="receipt"
          hint={`${stats.transactionCount} transaction${stats.transactionCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Unsettled"
          value={stats.pendingTotal}
          format="compactCurrency"
          currency={currency}
          icon="late"
          delta={
            stats.pendingCount > 0
              ? {
                  label: `${stats.pendingCount} awaiting payment`,
                  direction: "flat",
                  inverted: true,
                }
              : { label: "all settled", direction: "flat" }
          }
        />
        <StatCard
          label="Committed monthly"
          value={stats.recurringMonthly}
          format="compactCurrency"
          currency={currency}
          icon="deadline"
          hint={
            stats.recurringCount > 0
              ? `${stats.recurringCount} recurring`
              : "nothing recurring yet"
          }
        />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Spending</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Per month, last six. Averaging {formatAmount(stats.averageMonthly, currency)} across
                the months with any spend.
              </p>
            </div>
            <span className="text-sm font-medium tabular-nums">
              {formatAmount(stats.thisWeek, currency)}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">last 7 days</span>
            </span>
          </header>
          <TrendChart
            points={stats.trend.map((m) => ({ label: m.label, value: m.total }))}
            format="currency"
            currency={currency}
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By category</h2>
          <DonutChart
            slices={stats.byCategory}
            centreLabel="spent"
            format="compactCurrency"
            currency={currency}
          />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold">Project cost vs overhead</h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Disjoint by design - every expense is one or the other, so these add up to the whole.
          </p>
          <DonutChart
            slices={[
              // Short, because the heading above already says what the split
              // is and the legend column truncates anything longer.
              { label: "Project costs", value: stats.projectTotal },
              // The same label the project breakdown uses, so the two agree.
              { label: OVERHEAD_LABEL, value: stats.overheadTotal },
            ].filter((s) => s.value > 0)}
            centreLabel="spent"
            format="compactCurrency"
            currency={currency}
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">By department</h2>
          <DonutChart
            slices={stats.byDepartment}
            centreLabel="spent"
            format="compactCurrency"
            currency={currency}
          />
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Where it went</h2>
          {stats.byProject.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {stats.byProject.slice(0, 6).map((entry) => {
                const share = stats.total > 0 ? entry.value / stats.total : 0
                return (
                  <li key={entry.label}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate" title={entry.label}>
                        {entry.label}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatCompactAmount(entry.value, currency)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-1"
                        style={{ width: `${Math.max(share * 100, 3)}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <ExpensesTable
        rows={rows}
        projects={projectOptions}
        departments={departmentOptions}
        currency={currency}
        categories={categories}
      />
    </div>
  )
}
