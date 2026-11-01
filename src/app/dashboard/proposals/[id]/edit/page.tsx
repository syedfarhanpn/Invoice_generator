import { notFound } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { requirePermission } from "@/lib/access"
import { DEFAULT_VALIDITY_DAYS, DEFAULT_WARRANTY_DAYS } from "@/lib/proposals/input"
import { loadProposal } from "@/lib/proposals/load"
import { proposalsReady } from "@/lib/proposals/store"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { ProposalForm } from "../../proposal-form"
import { MigrationNotice, SetupNotice } from "../../setup-notice"

export const metadata = { title: "Edit proposal" }

// A rewrite asks Claude again, under this page's limit.
export const maxDuration = 300

export default async function EditProposalPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission("documents", "write")

  if (!(await proposalsReady())) return <MigrationNotice />

  const [{ id }, { workspaceId }] = await Promise.all([props.params, getWorkspaceIdentity()])
  const loaded = await loadProposal(id, workspaceId)
  if (!loaded) notFound()
  const { proposal, brief } = loaded

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Edit ${proposal.refNumber}`}
        trail={[
          { label: "Proposals", href: "/dashboard/proposals" },
          { label: proposal.refNumber, href: `/dashboard/proposals/${proposal.id}` },
          { label: "Edit" },
        ]}
      />
      {brief ? (
        <ProposalForm
          mode="edit"
          proposalId={proposal.id}
          clientLabel={`${proposal.client.businessName || proposal.client.fullName} (${proposal.client.code})`}
          initialBrief={brief}
          defaults={{
            currency: brief.currency,
            validityDays: brief.validityDays ?? DEFAULT_VALIDITY_DAYS,
            warrantyDays: brief.warrantyDays ?? DEFAULT_WARRANTY_DAYS,
          }}
        />
      ) : (
        <SetupNotice title="This proposal's brief could not be read">
          Write a new proposal for this client instead.
        </SetupNotice>
      )}
    </div>
  )
}
