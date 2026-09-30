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
  const user = await getCurrentUser()

  const boards = await Promise.all(
    PANELS.map(async (panel) => {
      const board = await ensureBoard(user.id, panel.kind)

      // Occupancy per column, so deleting one can say what is in the way.
      const counts = await Promise.all(
        board.stages.map(async (stage) => {
          const [deals, projects, tasks] = await Promise.all([
            panel.kind === "LEADS"
              ? prisma.deal.count({ where: { stageId: stage.id, archivedAt: null } })
              : 0,
            panel.kind === "PROJECTS"
              ? prisma.project.count({ where: { stageId: stage.id, archivedAt: null } })
              : 0,
            panel.kind === "TASKS" ? prisma.task.count({ where: { stageId: stage.id } }) : 0,
          ])
          return deals + projects + tasks
        })
      )

      const stages: EditableStage[] = board.stages.map((stage, index) => ({
        id: stage.id,
        name: stage.name,
        position: stage.position,
        type: stage.type,
        count: counts[index] ?? 0,
      }))

      return { ...panel, stages }
    })
  )

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Board columns</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rename, reorder and add the columns on each board. Changes apply straight away.
        </p>
      </div>

      {boards.map((board) => (
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
