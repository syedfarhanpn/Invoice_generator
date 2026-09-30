import { CalendarClock, CircleDollarSign, FolderKanban, Send } from "lucide-react"

import { PageHeader, Stat, StatStrip } from "@/components/app/page-header"
import type { BoardCard, BoardColumn } from "@/components/board/board"
import type { ClientOption } from "@/components/workspace/deal-detail"
import { ensureBoard } from "@/lib/boards"
import { getCurrentUser } from "@/lib/current-user"
import { describeDue, toLocalDayKey } from "@/lib/dates"
import prisma from "@/lib/db"
import { formatMoney } from "@/lib/money"

import { ProjectsBoard, type ProjectDetailData } from "./projects-board"

export const metadata = { title: "Projects" }

/**
 * Work in flight, as a board.
 *
 * The columns are the operator's own - seeded once with Onboarding through
 * Completed and editable in Preferences afterwards - so this page never
 * assumes a delivery process it was not told about.
 */
export default async function ProjectsPage() {
  const user = await getCurrentUser()
  const board = await ensureBoard(user.id, "PROJECTS")

  const [projects, profile, clients] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ position: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        stageId: true,
        position: true,
        value: true,
        currency: true,
        deadline: true,
        clientId: true,
        client: { select: { businessName: true, fullName: true } },
        sourceDeal: { select: { title: true } },
        stage: { select: { type: true } },
        _count: { select: { tasks: true } },
      },
    }),
    prisma.businessProfile.findUnique({
      where: { userId: user.id },
      select: { currency: true },
    }),
    prisma.client.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ businessName: "asc" }, { fullName: "asc" }],
      select: { id: true, businessName: true, fullName: true },
    }),
  ])

  const fallbackCurrency = profile?.currency || "INR"

  const columns: BoardColumn[] = board.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    type: stage.type,
  }))

  const cards: BoardCard[] = projects.map((project) => {
    const badges: BoardCard["badges"] = []

    if (project.value != null) {
      badges.push({
        label: formatMoney(Number(project.value), project.currency || fallbackCurrency),
        tone: "muted",
      })
    }

    if (project.deadline) {
      const { label, tone } = describeDue(project.deadline)
      // Only late and today earn the signal colour; everything else is quiet.
      badges.push({
        label,
        tone: tone === "overdue" || tone === "today" ? "danger" : "muted",
      })
    }

    if (project._count.tasks > 0) {
      badges.push({ label: `${project._count.tasks} tasks`, tone: "muted" })
    }

    return {
      id: project.id,
      stageId: project.stageId,
      title: project.title,
      subtitle: project.client?.businessName || project.client?.fullName || null,
      badges,
      done: project.stage.type === "WON",
    }
  })

  const details: Record<string, ProjectDetailData> = Object.fromEntries(
    projects.map((project) => [
      project.id,
      {
        id: project.id,
        title: project.title,
        clientId: project.clientId,
        value: project.value != null ? String(Number(project.value)) : "",
        deadline: toLocalDayKey(project.deadline),
        description: project.description ?? "",
        sourceDealTitle: project.sourceDeal?.title ?? null,
      },
    ])
  )

  const clientOptions: ClientOption[] = clients.map((client) => ({
    id: client.id,
    label: client.businessName || client.fullName,
  }))

  // Figures describe the board you are looking at, so they are derived from
  // the same rows rather than counted again in the database.
  const openStageIds = new Set(
    board.stages.filter((stage) => stage.type === "OPEN").map((stage) => stage.id)
  )
  const active = projects.filter((project) => openStageIds.has(project.stageId))
  const totalValue = active.reduce(
    (sum, project) =>
      sum + (project.currency === fallbackCurrency && project.value ? Number(project.value) : 0),
    0
  )
  const late = active.filter(
    (project) => project.deadline && describeDue(project.deadline).tone === "overdue"
  ).length
  const delivered = projects.length - active.length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-4 p-4 pb-0 md:px-8 md:pt-8">
        <PageHeader title="Projects" trail={[{ label: "Projects" }]} />

        <StatStrip>
          <Stat label="Active projects" value={String(active.length)} icon={FolderKanban} />
          <Stat
            label="Value in flight"
            value={formatMoney(totalValue, fallbackCurrency)}
            icon={CircleDollarSign}
          />
          <Stat
            label="Past deadline"
            value={String(late)}
            icon={CalendarClock}
            delta={
              late > 0
                ? { text: "needs attention", direction: "down" }
                : { text: "all on time", direction: "flat" }
            }
          />
          <Stat label="Delivered" value={String(delivered)} icon={Send} />
        </StatStrip>
      </div>

      <ProjectsBoard
        columns={columns}
        cards={cards}
        details={details}
        clients={clientOptions}
      />
    </div>
  )
}
