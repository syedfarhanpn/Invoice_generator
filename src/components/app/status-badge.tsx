import { Badge } from "@/components/ui/badge"
import type { DocumentStatus } from "@prisma/client"
import { paymentSummary, type PaymentSummary } from "@/lib/money"

const LIFECYCLE_STYLE: Record<DocumentStatus, { label: string; variant: "outline" | "secondary" | "default" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  FINALIZED: { label: "Finalized", variant: "secondary" },
  SIGNED: { label: "Signed", variant: "default" },
  VOID: { label: "Void", variant: "destructive" },
  ARCHIVED: { label: "Archived", variant: "outline" },
}

/** Lifecycle badge: draft / finalized / signed / void / archived. */
export function LifecycleBadge({ status }: { status: DocumentStatus }) {
  const cfg = LIFECYCLE_STYLE[status]
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

const PAYMENT_STYLE: Record<PaymentSummary["label"], "outline" | "secondary" | "default" | "destructive"> = {
  Draft: "outline",
  Unpaid: "outline",
  Partial: "secondary",
  Paid: "default",
  Overdue: "destructive",
}

/**
 * Paid/partial/overdue badge for invoices - always computed from the
 * Payment ledger + dueDate, never stored. See src/lib/money.ts.
 */
export function PaymentBadge({
  totalAmount,
  amountPaid,
  dueDate,
  isDraft,
  currency,
  advanceReceived,
}: {
  totalAmount: number | null | undefined
  amountPaid: number | null | undefined
  dueDate: Date | null | undefined
  isDraft: boolean
  currency: string
  /** Prior advance, so the badge agrees with the balance on the document. */
  advanceReceived?: number | null
}) {
  const summary = paymentSummary(totalAmount, amountPaid, dueDate, isDraft, currency, advanceReceived)
  return <Badge variant={PAYMENT_STYLE[summary.label]}>{summary.label}</Badge>
}
