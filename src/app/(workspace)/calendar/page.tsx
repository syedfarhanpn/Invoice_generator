import { PageHeader } from "@/components/app/page-header"
import { CalendarMonth, type CalendarEvent } from "@/components/app/calendar-month"
import { getCurrentUser } from "@/lib/current-user"
import { formatLocalTime, toLocalDayKey } from "@/lib/dates"
import prisma from "@/lib/db"

export const metadata = { title: "Calendar" }

/**
 * Everything with a date on it, in one month view.
 *
 * Tasks, project deadlines and invoice due dates all come due, so they share a
 * grid rather than living in three places you would have to check separately.
 * Each still links back to where it can actually be acted on.
 */

/** The window a month grid shows, padded for its leading and trailing weeks. */
function monthRange(year: number, month: number) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1 - 7)),
    to: new Date(Date.UTC(year, month, 7)),
  }
}

function parseMonth(value: string | undefined, today: Date): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "")
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    if (month >= 1 && month <= 12 && year >= 1970 && year <= 9999) return { year, month }
  }
  // Defaults to the current month in the operator's own zone, not the server's.
  const key = toLocalDayKey(today)
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) }
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const user = await getCurrentUser()
  const { month: monthParam } = await searchParams

  const now = new Date()
  const { year, month } = parseMonth(monthParam, now)
  const { from, to } = monthRange(year, month)

  const [tasks, projects, invoices] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id, dueAt: { gte: from, lt: to } },
      select: { id: true, title: true, dueAt: true, status: true, priority: true },
    }),
    prisma.project.findMany({
      where: { userId: user.id, archivedAt: null, deadline: { gte: from, lt: to } },
      select: { id: true, title: true, deadline: true, stage: { select: { type: true } } },
    }),
    prisma.document.findMany({
      where: {
        userId: user.id,
        type: "INVOICE",
        // Drafts were never billed; voids were cancelled after the fact.
        status: { notIn: ["DRAFT", "VOID"] },
        dueDate: { gte: from, lt: to },
      },
      select: {
        id: true,
        refNumber: true,
        title: true,
        dueDate: true,
        client: { select: { businessName: true, fullName: true } },
      },
    }),
  ])

  const events: CalendarEvent[] = [
    ...tasks.map((task) => ({
      id: `task:${task.id}`,
      title: task.title,
      dayKey: toLocalDayKey(task.dueAt),
      time: formatLocalTime(task.dueAt),
      tone:
        task.status === "DONE"
          ? ("success" as const)
          : task.priority === "HIGH"
            ? ("danger" as const)
            : ("info" as const),
      kind: "Task",
      href: "/tasks",
      done: task.status === "DONE",
    })),
    ...projects.map((project) => ({
      id: `project:${project.id}`,
      title: `${project.title} due`,
      dayKey: toLocalDayKey(project.deadline),
      time: null,
      tone: "special" as const,
      kind: "Project deadline",
      href: "/projects",
      done: project.stage.type === "WON",
    })),
    ...invoices.map((invoice) => ({
      id: `invoice:${invoice.id}`,
      title: `${invoice.refNumber || invoice.title || "Invoice"} · ${
        invoice.client?.businessName || invoice.client?.fullName || "No client"
      }`,
      dayKey: toLocalDayKey(invoice.dueDate),
      time: null,
      tone: "warning" as const,
      kind: "Invoice due",
      href: `/dashboard/documents/${invoice.id}`,
    })),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-8">
      <PageHeader title="Calendar" trail={[{ label: "Calendar" }]} />
      <CalendarMonth year={year} month={month} events={events} todayKey={toLocalDayKey(now)} />
    </div>
  )
}
