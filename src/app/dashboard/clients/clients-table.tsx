"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { RowCheckbox, SelectionBar, type BulkAction } from "@/components/app/selection-bar"
import { partitionClients } from "@/lib/bulk-actions"
import { bulkArchiveClients, bulkDeleteClients } from "@/app/dashboard/bulk-actions"

export type ClientRow = {
  id: string
  code: string
  fullName: string
  businessName: string | null
  email: string
  documentCount: number
  archived: boolean
}

export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])
  const deletable = partitionClients(selectedRows).eligible
  const allSelected = rows.length > 0 && selected.size === rows.length

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function finish() {
    setSelected(new Set())
    router.refresh()
  }

  const actions: BulkAction[] = [
    {
      key: "archive",
      label: "Archive",
      // Always available: archiving is reversible and never destroys anything.
      eligible: selectedRows.length,
      variant: "outline",
      confirm: (n) => `Archive ${n} client${n === 1 ? "" : "s"}? They stay on their documents and can be restored.`,
      run: () => bulkArchiveClients(selectedRows.map((r) => r.id), true),
    },
    {
      key: "restore",
      label: "Restore",
      eligible: selectedRows.filter((r) => r.archived).length,
      variant: "outline",
      confirm: (n) => `Restore ${n} client${n === 1 ? "" : "s"}?`,
      run: () => bulkArchiveClients(selectedRows.filter((r) => r.archived).map((r) => r.id), false),
    },
    {
      key: "delete",
      label: "Delete",
      eligible: deletable.length,
      variant: "destructive",
      confirm: (n) =>
        `Permanently delete ${n} client${n === 1 ? "" : "s"}? Only clients with no documents are removed - anyone you have billed is left untouched.`,
      run: () => bulkDeleteClients(deletable.map((r) => r.id)),
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
                    onChange={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())}
                    label="Select all clients"
                  />
                </th>
                <th className="p-4 font-medium">Code</th>
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Business</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Docs</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((client) => (
                <tr
                  key={client.id}
                  data-selected={selected.has(client.id) || undefined}
                  className="border-b transition-colors hover:bg-muted/50 data-selected:bg-muted/60"
                >
                  <td className="p-4">
                    <RowCheckbox
                      checked={selected.has(client.id)}
                      onChange={(on) => toggle(client.id, on)}
                      label={`Select ${client.fullName}`}
                    />
                  </td>
                  <td className="p-4 font-mono text-xs">
                    <Badge variant="outline">{client.code}</Badge>
                  </td>
                  <td className="p-4 font-medium">
                    <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                      {client.fullName}
                    </Link>
                    {client.archived && (
                      <span className="ml-2 text-xs text-muted-foreground">(archived)</span>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground">{client.businessName || "-"}</td>
                  <td className="p-4 text-muted-foreground">{client.email}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {client.documentCount}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No clients found. Add your first client to get started.
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
