import { PageHeader } from "@/components/app/page-header"
import { DealTable, type DealRow, type StageColumn } from "@/components/workspace/deal-table"
import type { ClientOption, DealDetailData } from "@/components/workspace/deal-detail"
import { ensureBoard } from "@/lib/boards"
import { getCurrentUser } from "@/lib/current-user"
import { toLocalDayKey } from "@/lib/dates"
import prisma from "@/lib/db"

export const metadata = { title: "Leads & CRM" }

/**
 * The CRM's one screen.
 *
 * Deals, their stage, the client they belong to and the single next open task
 * are loaded together, because all three views need exactly that and nothing
 * more. The views are groupings of these rows on the client, so switching
 * between them costs no round trip - and the editor opens from data already
 * on the page rather than fetching a deal again.
 */
export default async function CrmPage() {
  const user = await getCurrentUser()
  const board = await ensureBoard(user.id, "LEADS")

  const [profile, deals, clients] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { userId: user.id },
      select: { currency: true },
    }),
    prisma.deal.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        description: true,
        value: true,
        currency: true,
        source: true,
        expectedCloseDate: true,
        createdAt: true,
        clientId: true,
        stage: { select: { id: true, name: true, type: true, position: true } },
        client: { select: { businessName: true, fullName: true } },
        primaryContact: { select: { firstName: true, lastName: true } },
        // Only the next one: every view shows a single next action per deal.
        tasks: {
          where: { status: "OPEN" },
          orderBy: { dueAt: "asc" },
          take: 1,
          select: { title: true, dueAt: true },
        },
      },
    }),
    prisma.client.findMany({
      where: { userId: user.id, archivedAt: null },
      orderBy: [{ businessName: "asc" }, { fullName: "asc" }],
      select: { id: true, businessName: true, fullName: true },
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

  // Everything the editor needs, as the form wants it: dates already in the
  // operator's zone and numbers already strings, so opening a card fills the
  // fields without a round trip or a conversion in the browser.
  const details: Record<string, DealDetailData> = Object.fromEntries(
    deals.map((deal) => [
      deal.id,
      {
        id: deal.id,
        title: deal.title,
        clientId: deal.clientId,
        value: deal.value != null ? String(Number(deal.value)) : "",
        source: deal.source ?? "",
        expectedCloseDate: toLocalDayKey(deal.expectedCloseDate),
        description: deal.description ?? "",
        nextActionTitle: deal.tasks[0]?.title ?? "",
        nextActionDue: toLocalDayKey(deal.tasks[0]?.dueAt),
      },
    ])
  )

  const clientOptions: ClientOption[] = clients.map((client) => ({
    id: client.id,
    label: client.businessName || client.fullName,
  }))

  const stages: StageColumn[] = board.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    position: stage.position,
    type: stage.type,
  }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-4 pb-0 md:px-8 md:pt-8">
        <PageHeader title="Leads &amp; CRM" trail={[{ label: "Leads & CRM" }]} />
      </div>
      <DealTable rows={rows} stages={stages} details={details} clients={clientOptions} />
    </div>
  )
}
