import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { hasPermission, requirePermission } from "@/lib/access"
import { formatDocumentDateTime } from "@/lib/dates"
import { loadProposal } from "@/lib/proposals/load"
import { proposalsReady } from "@/lib/proposals/store"
import { proposalWriterConfigured } from "@/lib/proposals/writer"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { ClaudeKeyNotice, MigrationNotice, SetupNotice } from "../setup-notice"
import { ProposalStatusBadge } from "../status"
import { ProposalDocument } from "./proposal-document"
import { ProposalToolbar } from "./proposal-toolbar"

export const metadata = { title: "Proposal" }

// "Revise with Claude" runs under this page's limit.
export const maxDuration = 300

export default async function ProposalPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("documents", "read")

  if (!(await proposalsReady())) {
    return (
      <div className="space-y-5">
        <PageHeader title="Proposal" trail={[{ label: "Proposals", href: "/dashboard/proposals" }, { label: "Proposal" }]} />
        <MigrationNotice />
      </div>
    )
  }

  const [{ id }, { workspaceId }, canWrite] = await Promise.all([
    props.params,
    getWorkspaceIdentity(),
    hasPermission("documents", "write"),
  ])

  const loaded = await loadProposal(id, workspaceId)
  if (!loaded) notFound()
  const { proposal, profile, view } = loaded

  return (
    <div className="space-y-5">
      <PageHeader
        title={proposal.refNumber}
        trail={[{ label: "Proposals", href: "/dashboard/proposals" }, { label: proposal.refNumber }]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <ProposalStatusBadge status={proposal.status} />
            <span className="font-medium">{proposal.title}</span>
          </div>
          <p className="text-muted-foreground">
            For{" "}
            <Link href={`/dashboard/clients/${proposal.client.id}`} className="text-foreground hover:underline">
              {proposal.client.businessName || proposal.client.fullName}
            </Link>{" "}
            · client code <span className="font-mono text-foreground">{proposal.client.code}</span> · updated{" "}
            {formatDocumentDateTime(proposal.updatedAt)}
          </p>
        </div>
        <ProposalToolbar
          proposalId={proposal.id}
          refNumber={proposal.refNumber}
          clientId={proposal.client.id}
          status={proposal.status}
          canWrite={canWrite}
        />
      </div>

      {canWrite && !proposalWriterConfigured() && <ClaudeKeyNotice />}

      {view ? (
        <ProposalDocument view={view} paper={profile?.paperColor} font={profile?.documentFont} />
      ) : (
        <SetupNotice title="This proposal could not be read">
          Its saved content no longer matches the proposal layout. Use Edit details and rewrite it with Claude to
          regenerate it.
        </SetupNotice>
      )}
    </div>
  )
}
