"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SaveButton } from "@/components/app/save-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Trash2, Plus, CheckCircle2, Ban, Trash } from "lucide-react"
import type { BusinessProfile, Client, Document } from "@prisma/client"
import { updateDocument, finalizeDocument, voidDocument, deleteDraftDocument } from "./actions"
import ContractPreview from "./previews/contract-preview"
import SharePanel from "./share-panel"
import { CURRENCIES } from "@/lib/currencies"
import type { ContractContent, ContractClause, SignaturePayload } from "@/lib/types"

export default function ContractEditor({
  document,
  businessProfile,
  clients,
}: {
  document: Document & { client: Client | null }
  businessProfile: BusinessProfile | null
  clients: Client[]
}) {
  const router = useRouter()
  const isDraft = document.status === "DRAFT"
  const isSigned = document.status === "SIGNED"
  const initialContent = (document.content as unknown as ContractContent) || { clauses: [] }
  const signature = document.signatureData as unknown as SignaturePayload | null

  const [title, setTitle] = useState(document.title || "")
  const [clientId, setClientId] = useState(document.clientId || "none")
  const [effectiveDate, setEffectiveDate] = useState(
    document.issueDate ? new Date(document.issueDate).toISOString().split("T")[0] : ""
  )
  const [currency, setCurrency] = useState(document.currency)
  const [scopeSummary, setScopeSummary] = useState(initialContent.scopeSummary || "")
  const [clauses, setClauses] = useState<ContractClause[]>(
    initialContent.clauses?.length ? initialContent.clauses : [{ title: "Scope of Work", body: "" }]
  )
  const [totalFee, setTotalFee] = useState(initialContent.totalFee != null ? String(initialContent.totalFee) : "")
  const [feeNote, setFeeNote] = useState(initialContent.feeNote || "")

  const [isSaving, setIsSaving] = useState(false)
  // Bumped on every successful save; drives the green confirmation.
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedClient = clients.find((c) => c.id === clientId) || document.client || undefined

  function updateClause(index: number, patch: Partial<ContractClause>) {
    setClauses((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }
  function addClause() {
    setClauses((prev) => [...prev, { title: "", body: "" }])
  }
  function removeClause(index: number) {
    setClauses((prev) => prev.filter((_, i) => i !== index))
  }

  function buildContent(): ContractContent {
    return {
      clauses,
      effectiveDate: effectiveDate || null,
      scopeSummary,
      totalFee: totalFee ? parseFloat(totalFee) : null,
      feeNote,
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    try {
      await updateDocument(document.id, {
        title,
        clientId: clientId === "none" ? null : clientId,
        issueDate: effectiveDate ? new Date(effectiveDate) : null,
        dueDate: null,
        currency,
        taxMode: "NONE",
        content: buildContent(),
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
    if (!confirm("Finalize this contract? It will be numbered and locked, ready to send for signature.")) return
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
    if (!confirm("Void this contract? This cannot be undone.")) return
    await voidDocument(document.id)
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm("Delete this draft permanently?")) return
    await deleteDraftDocument(document.id)
    router.push("/dashboard/documents")
  }

  return (
    <div className="flex h-full flex-col md:flex-row overflow-hidden">
      <div className="w-full md:w-[440px] lg:w-[480px] border-r bg-background flex flex-col h-full">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-background z-10">
          <div>
            <div className="font-semibold">{document.refNumber || "Contract (draft)"}</div>
            <div className="text-xs text-muted-foreground">
              {isDraft ? "Editable" : isSigned ? "Signed - locked" : "Finalized - awaiting signature"}
            </div>
          </div>
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
          ) : document.status !== "VOID" && !isSigned ? (
            <Button onClick={handleVoid} size="sm" variant="outline">
              <Ban className="w-4 h-4 mr-2" /> Void
            </Button>
          ) : null}
        </div>

        {error && <div className="px-4 pt-3 text-sm text-destructive">{error}</div>}

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Document Info</h3>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isDraft} />
            </div>
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")} disabled={!isDraft}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client selected</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.businessName || c.fullName} ({c.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isDraft && clientId === "none" && (
                <p className="text-xs text-muted-foreground">Required before finalizing - the serial number is allocated per client.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Effective Date</Label>
                <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} disabled={!isDraft} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v ?? "")} disabled={!isDraft}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Summary (optional)</Label>
              <Textarea value={scopeSummary} onChange={(e) => setScopeSummary(e.target.value)} disabled={!isDraft} rows={2} />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Clauses</h3>
            {clauses.map((clause, index) => (
              <Card key={index} className="p-3 relative group space-y-2">
                {isDraft && (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeClause(index)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Clause Title</Label>
                  <Input value={clause.title} onChange={(e) => updateClause(index, { title: e.target.value })} disabled={!isDraft} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Text</Label>
                  <Textarea value={clause.body} onChange={(e) => updateClause(index, { body: e.target.value })} disabled={!isDraft} rows={4} className="text-sm" />
                </div>
              </Card>
            ))}
            {isDraft && (
              <Button type="button" variant="outline" className="w-full text-xs" onClick={addClause}>
                <Plus className="w-3 h-3 mr-2" /> Add Clause
              </Button>
            )}
          </div>

          <Separator />

          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fee (optional)</h3>
            <div className="space-y-2">
              <Label>Total Fee</Label>
              <Input type="number" step="0.01" value={totalFee} onChange={(e) => setTotalFee(e.target.value)} disabled={!isDraft} />
            </div>
            <div className="space-y-2">
              <Label>Fee note</Label>
              <Input value={feeNote} onChange={(e) => setFeeNote(e.target.value)} disabled={!isDraft} placeholder="e.g. Billed monthly, due on the 1st" />
            </div>
          </div>

          {!isDraft && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Signature</h3>
                {signature ? (
                  <div className="text-sm space-y-1">
                    <Badge>Signed</Badge>
                    <div className="text-muted-foreground">
                      {signature.method === "typed" ? signature.typedName : "Drawn signature"} on{" "}
                      {new Date(signature.signedAt).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Awaiting client signature - share the link below.</p>
                )}
              </div>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Share</h3>
                <SharePanel documentId={document.id} publicSlug={document.publicSlug} />
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

      <div className="flex-1 bg-muted/30 flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center">
          <div className="w-full max-w-[800px] min-h-[1000px] bg-background shadow-xl border overflow-hidden">
            <ContractPreview
              refNumber={document.refNumber}
              isDraft={isDraft}
              title={title}
              issueDate={effectiveDate || null}
              currency={currency}
              content={buildContent()}
              issuer={businessProfile}
              client={selectedClient}
              signature={signature}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
