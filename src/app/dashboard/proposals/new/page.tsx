import { PageHeader } from "@/components/app/page-header"
import { hasPermission, isWorkspaceAdmin, requirePermission } from "@/lib/access"
import prisma from "@/lib/db"
import { claudeConnected } from "@/lib/integrations/store"
import { DEFAULT_VALIDITY_DAYS, DEFAULT_WARRANTY_DAYS, proposalBriefSchema } from "@/lib/proposals/input"
import { proposalsReady } from "@/lib/proposals/store"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { ProposalForm } from "../proposal-form"
import { ClaudeKeyNotice, MigrationNotice } from "../setup-notice"

export const metadata = { title: "New proposal" }

// Claude takes about a minute to write a proposal, and the action that asks
// it runs under this page's limit.
export const maxDuration = 300

export default async function NewProposalPage(props: { searchParams: Promise<{ client?: string }> }) {
  await requirePermission("documents", "write")

  const header = (
    <PageHeader
      title="New proposal"
      trail={[{ label: "Proposals", href: "/dashboard/proposals" }, { label: "New" }]}
    />
  )

  if (!(await proposalsReady())) {
    return (
      <div className="space-y-5">
        {header}
        <MigrationNotice />
      </div>
    )
  }

  const [{ workspaceId, orgId }, searchParams, canCreateClient, canManage] = await Promise.all([
    getWorkspaceIdentity(),
    props.searchParams,
    hasPermission("clients", "write"),
    isWorkspaceAdmin(),
  ])
  const connected = await claudeConnected(orgId)

  const [clients, profile, latest] = await Promise.all([
    prisma.client.findMany({
      where: { userId: workspaceId, archivedAt: null },
      orderBy: [{ businessName: "asc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, businessName: true, code: true, email: true },
    }),
    prisma.businessProfile.findUnique({ where: { userId: workspaceId }, select: { currency: true } }),
    // The last proposal's choices are the best guess for this one's.
    prisma.proposal.findFirst({
      where: { userId: workspaceId },
      orderBy: { createdAt: "desc" },
      select: { input: true },
    }),
  ])

  const last = latest ? proposalBriefSchema.safeParse(latest.input) : null
  const lastBrief = last?.success ? last.data : null
  const initialClientId = clients.some((c) => c.id === searchParams.client) ? searchParams.client : undefined

  return (
    <div className="space-y-5">
      {header}
      {!connected && <ClaudeKeyNotice canManage={canManage} />}
      <ProposalForm
        mode="create"
        clients={clients}
        initialClientId={initialClientId}
        canCreateClient={canCreateClient}
        defaults={{
          currency: profile?.currency ?? "INR",
          validityDays: lastBrief?.validityDays ?? DEFAULT_VALIDITY_DAYS,
          warrantyDays: lastBrief?.warrantyDays ?? DEFAULT_WARRANTY_DAYS,
          signatoryTitle: lastBrief?.signatoryTitle,
        }}
      />
    </div>
  )
}
