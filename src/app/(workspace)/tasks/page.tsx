import type { TaskPriority } from "@prisma/client"
import { AlarmClock, CircleCheck, ListChecks, TriangleAlert } from "lucide-react"

import { PageHeader, Stat, StatStrip } from "@/components/app/page-header"
import type { BoardCard, BoardColumn } from "@/components/board/board"
import { ensureBoard } from "@/lib/boards"
import { getCurrentUser } from "@/lib/current-user"
import { describeDue, formatLocalTime, toLocalInputValue } from "@/lib/dates"
import prisma from "@/lib/db"

import { TasksBoard } from "./tasks-board"

export const metadata = { title: "Tasks" }

/** Everything the scheduling panel needs, so opening a card costs no request. */
export type TaskDetail = {
  id: string
  title: string
  notes: string | null
  priority: TaskPriority
  dueAtLocal: string
  remindAtLocal: string
  projectTitle: string | null
}

const PRIORITY_TONE = { HIGH: "danger", NORMAL: "muted", LOW: "muted" } as const

export default async function TasksPage() {
  const user = await getCurrentUser()
  const board = await ensureBoard(user.id, "TASKS")

  // Board cards are the tasks that live on it. Follow-ups created against a
  // deal have no column and belong to the CRM's agenda, not here.
  const tasks = await prisma.task.findMany({
    where: { userId: user.id, stageId: { not: null } },
    orderBy: [{ position: "asc" }],
    select: {
      id: true,
      title: true,
      notes: true,
      status: true,
      priority: true,
      dueAt: true,
      remindAt: true,
      stageId: true,
      stage: { select: { type: true } },
      project: { select: { title: true } },
    },
  })

  const columns: BoardColumn[] = board.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    type: stage.type,
  }))

  const cards: BoardCard[] = tasks.map((task) => {
    const badges: BoardCard["badges"] = []

    if (task.dueAt) {
      const { label, tone } = describeDue(task.dueAt)
      const time = formatLocalTime(task.dueAt)
      badges.push({
        label: time ? `${label}, ${time}` : label,
        tone: tone === "overdue" || tone === "today" ? "danger" : "muted",
      })
    }

    if (task.priority === "HIGH") {
      badges.push({ label: "High", tone: PRIORITY_TONE.HIGH })
    }

    if (task.remindAt) badges.push({ label: "Reminder set", tone: "info" })
    if (task.project) badges.push({ label: task.project.title, tone: "special" })

    return {
      id: task.id,
      stageId: task.stageId!,
      title: task.title,
      badges,
      done: task.stage?.type === "WON",
    }
  })

  const details: Record<string, TaskDetail> = Object.fromEntries(
    tasks.map((task) => [
      task.id,
      {
        id: task.id,
        title: task.title,
        notes: task.notes,
        priority: task.priority,
        dueAtLocal: toLocalInputValue(task.dueAt),
        remindAtLocal: toLocalInputValue(task.remindAt),
        projectTitle: task.project?.title ?? null,
      },
    ])
  )

  const open = tasks.filter((task) => task.status === "OPEN")
  const overdue = open.filter(
    (task) => task.dueAt && describeDue(task.dueAt).tone === "overdue"
  ).length
  const today = open.filter((task) => task.dueAt && describeDue(task.dueAt).tone === "today").length
  const done = tasks.filter((task) => task.status === "DONE").length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-4 p-4 pb-0 md:px-8 md:pt-8">
        <PageHeader title="Tasks" trail={[{ label: "Tasks" }]} />

        <StatStrip>
          <Stat label="Open" value={String(open.length)} icon={ListChecks} />
          <Stat
            label="Due today"
            value={String(today)}
            icon={AlarmClock}
            delta={today > 0 ? { text: "on your plate", direction: "flat" } : undefined}
          />
          <Stat
            label="Overdue"
            value={String(overdue)}
            icon={TriangleAlert}
            delta={
              overdue > 0
                ? { text: "past due", direction: "down" }
                : { text: "nothing late", direction: "flat" }
            }
          />
          <Stat label="Completed" value={String(done)} icon={CircleCheck} />
        </StatStrip>
      </div>

      <TasksBoard columns={columns} cards={cards} details={details} />
    </div>
  )
}
