import { requirePermission } from "@/lib/access"
import type { PipelineKind } from "@prisma/client"

import { ensureBoard } from "@/lib/boards"
import { getCurrentUser } from "@/lib/current-user"
import prisma from "@/lib/db"

import { StageEditor, type EditableStage } from "./stage-editor"

export const metadata = { title: "Board columns" }

/**
 * The columns on every board, in one place.
 *
 * All three panels share the same stage table, so they share this screen. The
 * behaviour dropdown is the only thing that carries meaning beyond the label:
 * a card in a "closes as done" column is finished, which is what the boards,
 * the calendar and the figures all read.
 */

const PANELS: { kind: PipelineKind; title: string; description: string }[] = [
  {
    kind: "LEADS",
    title: "Leads & CRM",
    description: "The stages a lead moves through, from first contact to won or lost.",
  },
  {
    kind: "PROJECTS",
    title: "Projects",
    description: "How work moves once it is sold - onboarding through to delivered.",
  },
  {
    kind: "TASKS",
    title: "Tasks",
    description: "Your to-do columns. Dropping a task in a 'closes as done' column ticks it off.",
  },
]

export default async function BoardSettingsPage() {
  await requirePermission("settings", "read")

  const user = await getCurrentUser()

  // Boards first, then ONE grouped count per kind.
  //
  // This used to issue a count per column per board - three boards of five
  // columns was fifteen round trips, each waiting on the last board's
  // ensureBoard before it even started. Three groupBy queries answer the same
  // question: a column absent from the result simply holds nothing.
  const boards = await Promise.all(PANELS.map((panel) => ensureBoard(user.id, panel.kind)))

  const [dealCounts, projectCounts, taskCounts] = await Promise.all([
    prisma.deal.groupBy({
      by: ["stageId"],
      where: { userId: user.id, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.project.groupBy({
      by: ["stageId"],
      where: { userId: user.id, archivedAt: null },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["stageId"],
      where: { userId: user.id },
      _count: { _all: true },
    }),
  ])

  const occupancy = new Map<string, number>()
  for (const row of [...dealCounts, ...projectCounts, ...taskCounts]) {
    // A task can sit in no column at all, and those belong to no stage's
    // occupancy - they are not what would block a column from being deleted.
    if (!row.stageId) continue
    occupancy.set(row.stageId, (occupancy.get(row.stageId) ?? 0) + row._count._all)
  }

  const panels = PANELS.map((panel, i) => ({
    ...panel,
    stages: boards[i].stages.map(
      (stage): EditableStage => ({
        id: stage.id,
        name: stage.name,
        position: stage.position,
        type: stage.type,
        count: occupancy.get(stage.id) ?? 0,
      })
    ),
  }))

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Board columns</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rename, reorder and add the columns on each board. Changes apply straight away.
        </p>
      </div>

      {panels.map((board) => (
        <StageEditor
          key={board.kind}
          kind={board.kind}
          title={board.title}
          description={board.description}
          stages={board.stages}
        />
      ))}
    </div>
  )
}
