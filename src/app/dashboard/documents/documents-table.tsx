"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { DocumentStatus, DocumentType } from "@prisma/client"

import { Card } from "@/components/ui/card"
import { LifecycleBadge, PaymentBadge } from "@/components/app/status-badge"
import { RowCheckbox, SelectionBar, type BulkAction } from "@/components/app/selection-bar"
import { partitionDocuments } from "@/lib/bulk-actions"
import { bulkDeleteDocuments, bulkVoidDocuments } from "@/app/dashboard/bulk-actions"

export type DocumentRow = {
  id: string
  refLabel: string
  typeLabel: string
  type: DocumentType
  clientName: string
  status: DocumentStatus
  totalAmount: number | null
  amountPaid: number
  advanceReceived: number
  dueDate: Date | null
  currency: string
  amountText: string
  dateText: string
}

export function DocumentsTable({ rows, emptyMessage }: { rows: DocumentRow[]; emptyMessage: string }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  )

  // Eligibility is computed from the same rules the server enforces, so the
  // counts on the buttons match what will actually happen.
  const deletable = partitionDocuments(selectedRows, "delete").eligible
  const voidable = partitionDocuments(selectedRows, "void").eligible

  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())
  }

  function finish() {
    setSelected(new Set())
    router.refresh()
  }

  const actions: BulkAction[] = [
    {
      key: "void",
      label: "Void",
      eligible: voidable.length,
      variant: "outline",
      confirm: (n) =>
        `Void ${n} document${n === 1 ? "" : "s"}? Their numbers stay allocated and their share links are revoked. This cannot be undone.`,
      run: () => bulkVoidDocuments(voidable.map((r) => r.id)),
    },
    {
      key: "delete",
      label: "Delete",
      eligible: deletable.length,
      variant: "destructive",
      confirm: (n) =>
        `Permanently delete ${n} draft${n === 1 ? "" : "s"}? Only drafts are removed - issued documents are never deleted.`,
      run: () => bulkDeleteDocuments(deletable.map((r) => r.id)),
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted text-muted-foreground border-b">
              <tr>
                <th className="w-10 p-4">
                  <RowCheckbox
                    checked={allSelected}
                    indeterminate={selected.size > 0}
                    onChange={toggleAll}
                    label="Select all documents"
                  />
                </th>
                <th className="p-4 font-medium">Reference</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Client</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Amount</th>
                <th className="p-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((doc) => (
                <tr
                  key={doc.id}
                  data-selected={selected.has(doc.id) || undefined}
                  className="border-b transition-colors hover:bg-muted/50 data-selected:bg-muted/60"
                >
                  <td className="p-4">
                    <RowCheckbox
                      checked={selected.has(doc.id)}
                      onChange={(on) => toggle(doc.id, on)}
                      label={`Select ${doc.refLabel}`}
                    />
                  </td>
                  <td className="p-4 font-medium">
                    <Link href={`/dashboard/documents/${doc.id}`} className="hover:underline text-primary">
                      {doc.refLabel}
                    </Link>
                  </td>
                  <td className="p-4 text-muted-foreground">{doc.typeLabel}</td>
                  <td className="p-4">{doc.clientName}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <LifecycleBadge status={doc.status} />
                      {doc.type === "INVOICE" && doc.status !== "DRAFT" && doc.status !== "VOID" && (
                        <PaymentBadge
                          totalAmount={doc.totalAmount}
                          amountPaid={doc.amountPaid}
                          dueDate={doc.dueDate}
                          isDraft={false}
                          currency={doc.currency}
                          advanceReceived={doc.advanceReceived}
                        />
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-right">{doc.amountText}</td>
                  <td className="p-4 text-muted-foreground">{doc.dateText}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SelectionBar
        selectedCount={selected.size}
        actions={actions}
        onClear={() => setSelected(new Set())}
        onDone={finish}
      />
    </div>
  )
}
