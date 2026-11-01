import prisma from "@/lib/db"

import { parseStoredDraft } from "./draft"
import { proposalBriefSchema, type ProposalBrief } from "./input"
import { buildProposalView, type ProposalView } from "./view"

/**
 * One proposal, ready to render - for the page and the PDF route alike, so
 * the two read the same rows the same way. Scoped to the workspace: an id from
 * another workspace is simply not found.
 */
export async function loadProposal(id: string, workspaceId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id, userId: workspaceId },
    include: {
      client: {
        select: {
          id: true,
          code: true,
          fullName: true,
          businessName: true,
          email: true,
          phone: true,
          address: true,
          country: true,
        },
      },
    },
  })
  if (!proposal) return null

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: workspaceId },
    select: {
      businessName: true,
      ownerName: true,
      email: true,
      phone: true,
      address: true,
      website: true,
      paperColor: true,
      documentFont: true,
    },
  })

  const brief = proposalBriefSchema.safeParse(proposal.input)
  const draft = parseStoredDraft(proposal.content)

  // A row whose JSON no longer fits is reported, not half-rendered.
  let view: ProposalView | null = null
  let parsedBrief: ProposalBrief | null = null
  if (brief.success && draft) {
    parsedBrief = brief.data
    view = buildProposalView(draft, {
      refNumber: proposal.refNumber,
      issueDate: proposal.issueDate,
      brief: brief.data,
      client: { ...proposal.client, email: proposal.client.email || null },
      issuer: profile,
    })
  }

  return { proposal, profile, view, brief: parsedBrief }
}
