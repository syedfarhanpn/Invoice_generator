"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SaveButton } from "@/components/app/save-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Trash2, Plus, CheckCircle2, Ban, Trash, FileOutput, ArrowUpRight, Eye } from "lucide-react"
import type { BusinessProfile, Client } from "@prisma/client"
import { updateDocument, finalizeDocument, voidDocument, deleteDraftDocument, convertToInvoice } from "./actions"
import InvoicePreview from "./previews/invoice-preview"
import SharePanel from "./share-panel"
import PaymentsPanel from "./payments-panel"
import { ClientPicker } from "@/components/app/client-picker"
import { DocumentPreviewPane } from "@/components/app/document-preview-pane"
import { cn } from "@/lib/utils"
import { CURRENCIES } from "@/lib/currencies"
import type { InvoiceContent, InvoiceLineItem } from "@/lib/types"
import { computeTotals, formatMoney } from "@/lib/money"
import { documentKind } from "@/lib/document-kinds"
import type { EditorDocument } from "./document-editor"

type PaymentRow = {
  id: string
  amount: number
  paidOn: string
  method: string | null
  reference: string | null
  note: string | null
}

export default function InvoiceEditor({
  document,
  businessProfile,
  clients,
  payments,
}: {
  document: EditorDocument
  businessProfile: BusinessProfile | null
  clients: Client[]
  payments: PaymentRow[]
}) {
  const router = useRouter()
  const isDraft = document.status === "DRAFT"
  // Labels, capabilities and wording all come from one table so a quote and
  // a proforma can share this editor without a pile of type checks.
  const kind = documentKind(document.type)
  const convertedInvoice = document.convertedTo[0] ?? null
  const initialContent = (document.content as unknown as InvoiceContent) || { lineItems: [], notes: "" }

  const [title, setTitle] = useState(document.title || "")
  const [clientId, setClientId] = useState(document.clientId || "none")
  const [issueDate, setIssueDate] = useState(document.issueDate ? new Date(document.issueDate).toISOString().split("T")[0] : "")
  const [dueDate, setDueDate] = useState(document.dueDate ? new Date(document.dueDate).toISOString().split("T")[0] : "")
  const [currency, setCurrency] = useState(document.currency)
  const [taxMode, setTaxMode] = useState<"NONE" | "PERCENTAGE">(document.taxMode)
  const [taxRate, setTaxRate] = useState(document.taxRate != null ? String(document.taxRate) : "")
  const [taxLabel, setTaxLabel] = useState(document.taxLabel || "Tax")
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(
    initialContent.lineItems?.length ? initialContent.lineItems : [{ description: "", qty: 1, rate: 0 }]
  )
  const [notes, setNotes] = useState(initialContent.notes || "")
  const [advanceReceived, setAdvanceReceived] = useState(
    document.advanceReceived > 0
      ? String(document.advanceReceived)
      : ""
  )

  const [isSaving, setIsSaving] = useState(false)
  // Bumped on every successful save; drives the green confirmation.
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  // Phones cannot show both panes at once, so one is visible at a time. On
  // md+ both are always shown and this is ignored.
  const [mobilePane, setMobilePane] = useState<"edit" | "view">("edit")
  const [error, setError] = useState<string | null>(null)

  const selectedClient = clients.find((c) => c.id === clientId) || document.client || undefined

  const advanceAmount = kind.supportsAdvance ? Math.max(0, parseFloat(advanceReceived) || 0) : 0
  const advanceMinor = Math.round(advanceAmount * 100)

  const totals = useMemo(
    () => computeTotals(lineItems, currency, taxMode, taxMode === "PERCENTAGE" ? parseFloat(taxRate) || 0 : 0),
    [lineItems, currency, taxMode, taxRate]
  )

  function updateLine(index: number, patch: Partial<InvoiceLineItem>) {
    setLineItems((prev) => prev.map((li, i) => (i === index ? { ...li, ...patch } : li)))
  }
  function addLine() {
    setLineItems((prev) => [...prev, { description: "", qty: 1, rate: 0 }])
  }
  function removeLine(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    try {
      await updateDocument(document.id, {
        title,
        clientId: clientId === "none" ? null : clientId,
        issueDate: issueDate ? new Date(issueDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        currency,
        taxMode,
        taxRate: taxMode === "PERCENTAGE" ? parseFloat(taxRate) || 0 : null,
        taxLabel: taxMode === "PERCENTAGE" ? taxLabel : null,
        content: { lineItems, notes },
        advanceReceived: kind.supportsAdvance ? parseFloat(advanceReceived) || 0 : 0,
      })
      router.refresh()
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleFinalize() {
    if (!confirm(`Finalize this ${kind.label.toLowerCase()}? It will be numbered and locked, and can no longer be edited.`)) return
    setIsFinalizing(true)
    setError(null)
    try {
      await handleSave()
      await finalizeDocument(document.id)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize")
    } finally {
      setIsFinalizing(false)
    }
  }

  async function handleVoid() {
    if (!confirm(`Void this ${kind.label.toLowerCase()}? This cannot be undone, and its number will not be reused.`)) return
    await voidDocument(document.id)
    router.refresh()
  }

  async function handleConvert() {
    if (!confirm(`Create a draft invoice from this ${kind.label.toLowerCase()}? It stays untouched and keeps its own number.`)) return
    setIsConverting(true)
    setError(null)
    try {
      const { invoiceId } = await convertToInvoice(document.id)
      router.push(`/dashboard/documents/${invoiceId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert")
      setIsConverting(false)
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this draft permanently?")) return
    await deleteDraftDocument(document.id)
    router.push("/dashboard/documents")
  }

  return (
    <div className="flex h-full flex-col md:flex-row overflow-hidden">
      <div className={cn("w-full md:w-[440px] lg:w-[480px] border-r bg-background flex flex-col h-full", mobilePane === "view" && "hidden md:flex")}>
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-background z-10">
          <div>
            <div className="font-semibold">{document.refNumber || `${kind.label} (draft)`}</div>
            <div className="text-xs text-muted-foreground">{isDraft ? "Editable" : "Finalized - read only"}</div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="md:hidden"
            onClick={() => setMobilePane("view")}
          >
            <Eye className="mr-2 size-4" /> View
          </Button>
          {isDraft ? (
            <div className="flex gap-2">
              <SaveButton
                saving={isSaving}
                savedAt={savedAt}
                onClick={handleSave}
                disabled={isSaving || isFinalizing}
              />
              <Button onClick={handleFinalize} size="sm" disabled={isSaving || isFinalizing}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> {isFinalizing ? "Finalizing..." : "Finalize"}
              </Button>
            </div>
          ) : document.status !== "VOID" ? (
            <div className="flex gap-2">
              {kind.convertsToInvoice && !convertedInvoice && (
                <Button onClick={handleConvert} size="sm" disabled={isConverting}>
                  <FileOutput className="w-4 h-4 mr-2" /> {isConverting ? "Converting..." : "Convert to Invoice"}
                </Button>
              )}
              <Button onClick={handleVoid} size="sm" variant="outline">
                <Ban className="w-4 h-4 mr-2" /> Void
              </Button>
            </div>
          ) : null}
        </div>

        {error && <div className="px-4 pt-3 text-sm text-destructive">{error}</div>}

        {(convertedInvoice || document.convertedFrom) && (
          <div className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
            {convertedInvoice && (
              <Link href={`/dashboard/documents/${convertedInvoice.id}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                Converted to {convertedInvoice.refNumber || "a draft invoice"} <ArrowUpRight className="size-3" />
              </Link>
            )}
            {document.convertedFrom && (
              <Link href={`/dashboard/documents/${document.convertedFrom.id}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                Created from {document.convertedFrom.refNumber || "an earlier document"} <ArrowUpRight className="size-3" />
              </Link>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Document Info</h3>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isDraft} placeholder="e.g. Website Redesign" />
            </div>
            <div className="space-y-2">
              <Label>Client</Label>
              <ClientPicker
                clients={clients}
                value={clientId}
                onChange={setClientId}
                disabled={!isDraft}
              />
              {isDraft && clientId === "none" && (
                <p className="text-xs text-muted-foreground">Required before finalizing - the serial number is allocated per client.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Issue Date</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={!isDraft} />
              </div>
              <div className="space-y-2">
                <Label>{kind.dateLabel}</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!isDraft} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v ?? "")} disabled={!isDraft}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tax</h3>
            <div className="space-y-2">
              <Label>Tax mode</Label>
              <Select value={taxMode} onValueChange={(v) => setTaxMode(v as "NONE" | "PERCENTAGE")} disabled={!isDraft}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No tax</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {taxMode === "PERCENTAGE" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} disabled={!isDraft} placeholder="GST, VAT..." />
                </div>
                <div className="space-y-2">
                  <Label>Rate (%)</Label>
                  <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} disabled={!isDraft} />
                </div>
              </div>
            )}
          </div>

          {kind.supportsAdvance && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount Already Received
                </h3>
                <div className="space-y-2">
                  <Label>Advance / earlier milestone</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={advanceReceived}
                    onChange={(e) => setAdvanceReceived(e.target.value)}
                    disabled={!isDraft}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    Deducted from the total on the document to show a balance due. Leave
                    empty if the full amount is payable. This is money received{" "}
                    <em>before</em> this invoice - payments against this invoice itself go
                    in the Payments section after finalizing.
                  </p>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Line Items</h3>

            {lineItems.map((item, index) => (
              <Card key={index} className="p-3 relative group">
                {isDraft && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeLine(index)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                      disabled={!isDraft}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateLine(index, { qty: parseFloat(e.target.value) || 0 })}
                        disabled={!isDraft}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rate</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateLine(index, { rate: parseFloat(e.target.value) || 0 })}
                        disabled={!isDraft}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="text-sm text-right font-medium pb-1.5">
                      {formatMoney((item.qty || 0) * (item.rate || 0), currency)}
                    </div>
                  </div>
                </div>
              </Card>
            ))}

            {isDraft && (
              <Button type="button" variant="outline" className="w-full text-xs" onClick={addLine}>
                <Plus className="w-3 h-3 mr-2" /> Add Item
              </Button>
            )}

            <div className="flex justify-end text-sm pt-2 space-y-1 flex-col items-end">
              <div className="text-muted-foreground">Subtotal: {formatMoney(totals.subtotal, currency)}</div>
              {taxMode === "PERCENTAGE" && (
                <div className="text-muted-foreground">{taxLabel}: {formatMoney(totals.taxAmount, currency)}</div>
              )}
              {(advanceMinor === 0 || totals.total !== totals.subtotal) && (
                <div className={advanceMinor > 0 ? "text-muted-foreground" : "font-semibold text-base"}>
                  Total: {formatMoney(totals.total, currency)}
                </div>
              )}
              {advanceMinor > 0 && (
                <>
                  <div className="text-muted-foreground">
                    Less received: -{formatMoney(advanceAmount, currency)}
                  </div>
                  <div className="font-semibold text-base">
                    Balance due: {formatMoney(Math.max(0, totals.total - advanceAmount), currency)}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2 mt-4">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!isDraft} rows={3} placeholder="Thank you for your business!" />
            </div>
          </div>

          {!isDraft && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Share</h3>
                <SharePanel documentId={document.id} publicSlug={document.publicSlug} />
              </div>
            </>
          )}

          {!isDraft && document.status !== "VOID" && kind.tracksPayments && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payments</h3>
                <PaymentsPanel
                  documentId={document.id}
                  currency={currency}
                  totalAmount={document.totalAmount}
                  amountPaid={document.amountPaid}
                  dueDate={document.dueDate ? document.dueDate.toISOString() : null}
                  payments={payments}
                />
              </div>
            </>
          )}

          {isDraft && (
            <>
              <Separator />
              <Button variant="ghost" size="sm" className="text-destructive w-full" onClick={handleDelete}>
                <Trash className="w-4 h-4 mr-2" /> Delete draft
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={cn("flex-1 h-full overflow-hidden", mobilePane === "edit" && "hidden md:block")}>
        <DocumentPreviewPane onEdit={() => setMobilePane("edit")} remeasureKey={mobilePane}>
          <div className="bg-background shadow-xl border">
            <InvoicePreview
              type={document.type}
              refNumber={document.refNumber}
              isDraft={isDraft}
              title={title}
              issueDate={issueDate || null}
              dueDate={dueDate || null}
              currency={currency}
              taxMode={taxMode}
              taxRate={taxMode === "PERCENTAGE" ? parseFloat(taxRate) || 0 : null}
              taxLabel={taxLabel}
              advanceReceived={advanceAmount}
              content={{ lineItems, notes }}
              issuer={businessProfile}
              client={selectedClient}
            />
          </div>
        </DocumentPreviewPane>
      </div>
    </div>
  )
}
