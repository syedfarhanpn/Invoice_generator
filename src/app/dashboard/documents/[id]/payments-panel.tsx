"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Trash2, Receipt } from "lucide-react"
import { recordPayment, deletePayment } from "./actions"
import { formatMoney, paymentSummary } from "@/lib/money"

export type PaymentRow = {
  id: string
  amount: number
  paidOn: string
  method: string | null
  receiptNumber: string | null
  reference: string | null
  note: string | null
}

export default function PaymentsPanel({
  documentId,
  currency,
  totalAmount,
  amountPaid,
  dueDate,
  payments,
  publicSlug,
}: {
  documentId: string
  currency: string
  totalAmount: number | null
  amountPaid: number
  dueDate: string | null
  payments: PaymentRow[]
  /** Receipts live under the invoice share link; null before it is shared. */
  publicSlug: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().split("T")[0])
  const [method, setMethod] = useState("")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = paymentSummary(totalAmount, amountPaid, dueDate ? new Date(dueDate) : null, false, currency)

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amt = parseFloat(amount)
    if (!(amt > 0)) {
      setError("Enter an amount greater than zero.")
      return
    }
    setBusy(true)
    try {
      await recordPayment(documentId, {
        amount: amt,
        paidOn: new Date(paidOn),
        method: method || undefined,
        reference: reference || undefined,
        note: note || undefined,
      })
      setOpen(false)
      setAmount("")
      setMethod("")
      setReference("")
      setNote("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(paymentId: string) {
    if (!confirm("Remove this payment record?")) return
    await deletePayment(documentId, paymentId)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-medium">{formatMoney(amountPaid, currency)}</span>
          <span className="text-muted-foreground"> of {formatMoney(totalAmount, currency)} received</span>
          {summary.label === "Overdue" && <span className="text-destructive ml-2 font-medium">Overdue</span>}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Record Payment
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record a payment</DialogTitle>
              <DialogDescription>Balance remaining: {formatMoney(summary.balance, currency)}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleRecord} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Amount</Label>
                  <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Method</Label>
                <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="UPI, Bank transfer, Cash..." />
              </div>
              <div className="space-y-1">
                <Label>Reference (optional)</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Record Payment"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {payments.length > 0 && (
        <div className="rounded-lg border divide-y">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <div>
                  <span className="font-medium">{formatMoney(p.amount, currency)}</span>
                  <span className="text-muted-foreground ml-2">{new Date(p.paidOn).toLocaleDateString()}</span>
                  {p.method && <span className="text-muted-foreground ml-2">via {p.method}</span>}
                </div>
                {p.receiptNumber && (
                  <div className="font-mono text-xs text-muted-foreground">{p.receiptNumber}</div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {/* Receipts are served from the invoice share link, so there is
                    nothing to download until the invoice has one. */}
                {publicSlug && (
                  <a
                    href={`/share/${publicSlug}/receipt/${p.id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                    title={p.receiptNumber ? `Download ${p.receiptNumber}` : "Download receipt"}
                  >
                    <Receipt className="mr-1.5 size-3.5" /> Receipt
                  </a>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(p.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
