"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CURRENCIES } from "@/lib/currencies"
import type { ClientFormInput } from "./actions"

function suggestCodePreview(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  return cleaned.slice(0, 4) || "CODE"
}

export default function ClientForm({
  initial,
  codeLocked,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<ClientFormInput>
  codeLocked?: boolean
  onSubmit: (input: ClientFormInput) => Promise<{ id: string }>
  submitLabel: string
}) {
  const router = useRouter()
  const [fullName, setFullName] = useState(initial?.fullName ?? "")
  const [businessName, setBusinessName] = useState(initial?.businessName ?? "")
  const [code, setCode] = useState(initial?.code ?? "")
  const [codeTouched, setCodeTouched] = useState(!!initial?.code)
  const [email, setEmail] = useState(initial?.email ?? "")
  const [phone, setPhone] = useState(initial?.phone ?? "")
  const [address, setAddress] = useState(initial?.address ?? "")
  const [country, setCountry] = useState(initial?.country ?? "")
  const [taxId, setTaxId] = useState(initial?.taxId ?? "")
  const [notes, setNotes] = useState(initial?.notes ?? "")
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "))
  const [defaultCurrency, setDefaultCurrency] = useState(initial?.defaultCurrency ?? "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewSource = businessName.trim() || fullName.trim()
  const displayedCode = codeTouched ? code : suggestCodePreview(previewSource || "client")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await onSubmit({
        fullName,
        businessName,
        email,
        phone,
        address,
        country,
        taxId,
        notes,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        defaultCurrency: defaultCurrency || undefined,
        code: codeTouched ? code : undefined,
      })
      router.push(`/dashboard/clients/${result.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Client details</CardTitle>
          <CardDescription>Used on invoices and contracts you create for this client.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID / GSTIN</Label>
              <Input id="taxId" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Default currency</Label>
              <Select value={defaultCurrency || "inherit"} onValueChange={(v) => setDefaultCurrency(!v || v === "inherit" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Use business default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Use business default</SelectItem>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">
                Serial code {codeLocked && <span className="text-xs text-muted-foreground">(locked - this client has documents)</span>}
              </Label>
              <Input
                id="code"
                value={displayedCode}
                disabled={codeLocked}
                onChange={(e) => {
                  setCodeTouched(true)
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))
                }}
                placeholder="ACME"
              />
              <p className="text-xs text-muted-foreground">
                Used in serial numbers, e.g. INV-{displayedCode || "ACME"}-001.
                {!codeLocked && " Auto-suggested from the business name until you edit it."}
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tags">Tags (comma separated)</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="active, high-value" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : submitLabel}</Button>
      </div>
    </form>
  )
}
