import { renderToBuffer } from "@react-pdf/renderer"
import { NextResponse, type NextRequest } from "next/server"

import { hasPermission } from "@/lib/access"
import { ProposalPdf } from "@/lib/pdf/proposal-pdf"
import { loadProposal } from "@/lib/proposals/load"
import { proposalsReady } from "@/lib/proposals/store"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

/**
 * The proposal as a PDF file, for the signed-in workspace only.
 *
 * Unlike invoices there is no public share link yet: the PDF is downloaded
 * here and sent to the client however the studio sends things (WhatsApp,
 * email). That keeps a draft priced proposal from being reachable by URL.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await hasPermission("documents", "read"))) {
    return new NextResponse("Not found", { status: 404 })
  }
  if (!(await proposalsReady())) {
    return new NextResponse("Proposals are not set up yet.", { status: 503 })
  }

  const [{ id }, { workspaceId }] = await Promise.all([ctx.params, getWorkspaceIdentity()])
  const loaded = await loadProposal(id, workspaceId)
  if (!loaded) return new NextResponse("Not found", { status: 404 })
  if (!loaded.view) return new NextResponse("This proposal could not be read.", { status: 422 })

  const buffer = await renderToBuffer(ProposalPdf({ view: loaded.view, appearance: loaded.profile }))

  const client = loaded.proposal.client.businessName || loaded.proposal.client.fullName
  const safeName = `Proposal - ${loaded.proposal.title} - ${client}`.replace(/[^A-Za-z0-9 ._-]+/g, "").trim()

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName || loaded.proposal.refNumber}.pdf"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  })
}
