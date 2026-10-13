import { BarChart3, PieChart } from "lucide-react"

import { requirePermission } from "@/lib/access"
import { AreaChart } from "@/components/app/area-chart"
import { DonutChart } from "@/components/app/donut-chart"
import { StatCard, StatRow } from "@/components/app/stat-card"
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
  const weekChange = percentChange(stats.thisWeek, stats.previousWeek)

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and manage all your business expenses in one place.
          </p>
        </div>
      </header>

      <StatRow>
        <StatCard
          variant="overview"
          href="#expenses"
          label="Total Expenses"
          value={stats.total}
          format="compactCurrency"
          currency={currency}
          icon="receipt"
          delta={{
            label: `${stats.transactionCount} transaction${stats.transactionCount === 1 ? "" : "s"}`,
            direction: "flat",
            caption: "all-time expenses",
          }}
        />
        <StatCard
          variant="overview"
          href="#expenses"
          label="Expenses This Month"
          value={stats.thisMonth}
          format="compactCurrency"
          currency={currency}
          icon="money"
          delta={
            monthChange == null
              ? { label: "nothing last month", direction: "flat" }
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
          variant="overview"
          href="#expenses"
          label="Expenses This Week"
          value={stats.thisWeek}
          format="compactCurrency"
          currency={currency}
          icon="deadline"
          delta={
            // A week with no spending is not "-100%". That is arithmetically
            // right and reads as a collapse; what happened is that nothing
            // was spent, and last week's figure is the useful context.
            stats.thisWeek === 0
              ? {
                  label: "nothing this week",
                  direction: "flat",
                  caption:
                    stats.previousWeek > 0
                      ? `${formatCompactAmount(stats.previousWeek, currency)} the 7 before`
                      : "last 7 days",
                }
              : weekChange == null
                ? { label: "last 7 days", direction: "flat" }
                : {
                    label: formatDelta(weekChange),
                    direction: weekChange >= 0 ? "up" : "down",
                    caption: "vs the 7 before",
                    inverted: true,
                  }
          }
        />
        <StatCard
          variant="overview"
          href="#expenses"
          label="Total Vendors"
          value={stats.vendorCount}
          format="integer"
          icon="clients"
          delta={{
            label: stats.vendorCount > 0 ? "unique vendors" : "none recorded",
            direction: "flat",
            caption: stats.vendorCount > 0 ? "all time" : undefined,
          }}
        />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-xl border bg-card p-5 lg:col-span-8">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Expense Trends
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Per month, last six. Averaging {formatAmount(stats.averageMonthly, currency)}{" "}
                across the months with any spend.
              </p>
            </div>
            <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
              Last 6 months
            </span>
          </header>
          <AreaChart
            points={stats.trend.map((m) => ({ label: m.label, value: m.total }))}
            format="currency"
            currency={currency}
          />
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-4">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <PieChart className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Expenses by Category
          </h2>
          {stats.byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <DonutChart
              slices={stats.byCategory}
              centreLabel="Total"
              format="compactCurrency"
              currency={currency}
            />
          )}
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

      <div id="expenses" className="scroll-mt-20" />
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
