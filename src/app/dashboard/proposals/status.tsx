import type { ProposalStatus } from "@prisma/client"

import { cn } from "@/lib/utils"

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
}

const TONE: Record<ProposalStatus, string> = {
  DRAFT: "border-border text-muted-foreground",
  SENT: "border-border text-foreground",
  ACCEPTED: "border-transparent bg-tone-success-bg text-tone-success",
  DECLINED: "border-transparent bg-tone-danger-bg text-tone-danger",
}

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        TONE[status]
      )}
    >
      {PROPOSAL_STATUS_LABEL[status]}
    </span>
  )
}
