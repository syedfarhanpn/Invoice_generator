import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { DealTable, type DealRow, type StageColumn } from "@/components/workspace/deal-table"

export const metadata = { title: "CRM" }

/**
 * The CRM's one screen.
 *
 * Deals, their stage, the client they belong to and the single next open task
 * are loaded together, because every one of the three views needs exactly that
 * and nothing more. The views are groupings of these rows on the client, so
 * switching between them costs no round trip.
 */
export default async function CrmPage() {
  const user = await getCurrentUser()

  const [profile, pipeline, deals] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { userId: user.id },
      select: { currency: true },
    }),
    prisma.pipeline.findFirst({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { position: "asc" }],
      include: { stages: { orderBy: { position: "asc" } } },
    }),
    prisma.deal.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        value: true,
        currency: true,
        source: true,
        createdAt: true,
        stage: { select: { id: true, name: true, type: true, position: true } },
        client: { select: { businessName: true, fullName: true } },
        primaryContact: { select: { firstName: true, lastName: true } },
        // Only the next one: the table shows a single next action per row.
        tasks: {
          where: { status: "OPEN" },
          orderBy: { dueAt: "asc" },
          take: 1,
          select: { title: true, dueAt: true },
        },
      },
    }),
  ])

  const fallbackCurrency = profile?.currency || "INR"

  const rows: DealRow[] = deals.map((deal) => {
    const next = deal.tasks[0]
    const contact = deal.primaryContact
    return {
      id: deal.id,
      title: deal.title,
      clientName: deal.client?.businessName || deal.client?.fullName || null,
      contactName: contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
        : null,
      value: deal.value != null ? Number(deal.value) : null,
      currency: deal.currency || fallbackCurrency,
      stageId: deal.stage.id,
      stageName: deal.stage.name,
      stageType: deal.stage.type,
      stagePosition: deal.stage.position,
      source: deal.source,
      nextTaskTitle: next?.title ?? null,
      nextTaskDueAt: next?.dueAt ? next.dueAt.toISOString() : null,
      createdAt: deal.createdAt.toISOString(),
    }
  })

  const stages: StageColumn[] = (pipeline?.stages ?? []).map((stage) => ({
    id: stage.id,
    name: stage.name,
    position: stage.position,
    type: stage.type,
  }))

  return (
    <div className="flex h-full flex-col">
      <DealTable rows={rows} stages={stages} />
    </div>
  )
}
