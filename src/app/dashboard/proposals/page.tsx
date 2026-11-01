import Link from "next/link"
import { FileText, Plus } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { hasPermission, requirePermission } from "@/lib/access"
import { formatTableDay } from "@/lib/dates"
import prisma from "@/lib/db"
import { proposalsReady } from "@/lib/proposals/store"
import { formatProposalMoney } from "@/lib/proposals/view"
import { proposalWriterConfigured } from "@/lib/proposals/writer"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { ClaudeKeyNotice, MigrationNotice } from "./setup-notice"
import { ProposalStatusBadge } from "./status"

export const metadata = { title: "Proposals" }

export default async function ProposalsPage() {
  await requirePermission("documents", "read")
  const canWrite = await hasPermission("documents", "write")

  const header = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Proposals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Written by Claude from a short brief, numbered with the client&apos;s code like their invoices.
        </p>
      </div>
      {canWrite && (
        <Link href="/dashboard/proposals/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="mr-1.5 size-4" /> New proposal
        </Link>
      )}
    </header>
  )

  if (!(await proposalsReady())) {
    return (
      <div className="space-y-5">
        {header}
        <MigrationNotice />
      </div>
    )
  }

  const { workspaceId } = await getWorkspaceIdentity()
  const proposals = await prisma.proposal.findMany({
    where: { userId: workspaceId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      refNumber: true,
      title: true,
      status: true,
      currency: true,
      totalAmount: true,
      issueDate: true,
      client: { select: { fullName: true, businessName: true } },
    },
  })

  return (
    <div className="space-y-5">
      {header}
      {canWrite && !proposalWriterConfigured() && <ClaudeKeyNotice />}

      {proposals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
          <FileText className="size-8 text-muted-foreground" strokeWidth={1.5} />
          <div>
            <p className="font-medium">No proposals yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Fill in the client, the price and a few lines about the project. Claude writes the rest, and you get a
              PDF in about a minute.
            </p>
          </div>
          {canWrite && (
            <Link href="/dashboard/proposals/new" className={buttonVariants({ size: "sm" })}>
              <Plus className="mr-1.5 size-4" /> Write the first one
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Number</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/dashboard/proposals/${p.id}`} className="font-medium hover:underline">
                        {p.refNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{p.client.businessName || p.client.fullName}</td>
                    <td className="max-w-[16rem] truncate px-4 py-3">{p.title}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.totalAmount != null ? (
                        formatProposalMoney(Number(p.totalAmount), p.currency)
                      ) : (
                        <span className="text-muted-foreground">To be confirmed</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ProposalStatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatTableDay(p.issueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
