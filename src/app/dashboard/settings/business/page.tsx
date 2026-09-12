import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import prisma from "@/lib/db"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/current-user"
import { LogoUploader } from "./logo-uploader"
import { DocumentAppearance } from "./document-appearance"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { CURRENCIES } from "@/lib/currencies"
import { maskApiKey } from "@/lib/api-key"
import { MIN_PASSWORD_LENGTH } from "@/lib/password"
import { parseDocumentFont, parsePaperColor } from "@/lib/document-theme"
import { SubmitButton } from "@/app/login/submit-button"
import { ThemeSelect } from "@/components/app/theme-select"
import { KeyManager, RevokeButton } from "../api-keys/key-manager"
import { changePassword } from "../security/actions"

export const metadata = { title: "Settings" }

export default async function SettingsPage(props: {
  searchParams: Promise<{ error?: string; updated?: string }>
}) {
  const [searchParams, user] = await Promise.all([props.searchParams, getCurrentUser()])

  const [profile, apiKeys] = await Promise.all([
    prisma.businessProfile.findUnique({ where: { userId: user.id } }),
    prisma.apiKey.findMany({
      where: { userId: user.id },
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      select: { id: true, name: true, lookupId: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    }),
  ])

  async function updateProfile(formData: FormData) {
    "use server"
    const userId = user?.id
    if (!userId) return

    const taxMode = (formData.get("defaultTaxMode") as string) === "PERCENTAGE" ? "PERCENTAGE" : "NONE"
    const taxRateRaw = formData.get("defaultTaxRate") as string
    const paymentTermRaw = formData.get("defaultPaymentTermDays") as string

    const data = {
      businessName: formData.get("businessName") as string,
      currency: formData.get("currency") as string,
      ownerName: formData.get("ownerName") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      address: formData.get("address") as string,
      website: formData.get("website") as string,
      taxId: formData.get("taxId") as string,
      brandColor: formData.get("brandColor") as string,
      paymentMethod: formData.get("paymentMethod") as string,
      bankName: formData.get("bankName") as string,
      accountNumber: formData.get("accountNumber") as string,
      routingSwift: formData.get("routingSwift") as string,
      upiId: formData.get("upiId") as string,
      defaultTaxMode: taxMode as "NONE" | "PERCENTAGE",
      defaultTaxRate: taxMode === "PERCENTAGE" && taxRateRaw ? parseFloat(taxRateRaw) : null,
      defaultTaxLabel: (formData.get("defaultTaxLabel") as string) || null,
      defaultInvoiceNote: (formData.get("defaultInvoiceNote") as string)?.trim() || null,
      defaultPaymentTermDays: paymentTermRaw ? parseInt(paymentTermRaw, 10) : null,
      signatureName: (formData.get("signatureName") as string) || null,
      // Both reach inline styles and the PDF, so they are validated rather
      // than stored as whatever the form posted.
      paperColor: parsePaperColor(formData.get("paperColor")),
      documentFont: parseDocumentFont(formData.get("documentFont")),
    }

    await prisma.businessProfile.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId },
    })

    redirect("/dashboard/settings/business")
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 w-full">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Business Profile</h2>
        <p className="text-muted-foreground">
          This appears on every invoice and contract you generate, and the defaults below pre-fill new documents.
        </p>
      </div>

      <form action={updateProfile}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>Basic details about your business.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input id="businessName" name="businessName" defaultValue={profile?.businessName || ""} required />
                </div>
                <div className="md:col-span-2">
                  <LogoUploader currentLogoUrl={profile?.logoUrl ?? null} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Owner Name</Label>
                  <Input id="ownerName" name="ownerName" defaultValue={profile?.ownerName || ""} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Public Email</Label>
                  <Input id="email" name="email" type="email" defaultValue={profile?.email || ""} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" name="phone" defaultValue={profile?.phone || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" name="website" defaultValue={profile?.website || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID / GSTIN</Label>
                  <Input id="taxId" name="taxId" defaultValue={profile?.taxId || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brandColor">Brand Color</Label>
                  <div className="flex gap-2">
                    <Input id="brandColor" name="brandColor" type="color" defaultValue={profile?.brandColor || "#000000"} className="w-12 p-1" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Default Currency</Label>
                  <Select name="currency" defaultValue={profile?.currency || "USD"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Used for new documents unless a client has its own default currency.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Business Address</Label>
                <Input id="address" name="address" defaultValue={profile?.address || ""} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Defaults</CardTitle>
              <CardDescription>Pre-fills every new invoice - still editable per document while it&apos;s a draft.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Default Tax Mode</Label>
                  <Select name="defaultTaxMode" defaultValue={profile?.defaultTaxMode || "NONE"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No tax</SelectItem>
                      <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultTaxLabel">Tax Label</Label>
                  <Input id="defaultTaxLabel" name="defaultTaxLabel" defaultValue={profile?.defaultTaxLabel || ""} placeholder="GST, VAT..." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultTaxRate">Tax Rate (%)</Label>
                  <Input id="defaultTaxRate" name="defaultTaxRate" type="number" step="0.01" defaultValue={profile?.defaultTaxRate?.toString() || ""} />
                </div>
              </div>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="defaultPaymentTermDays">Default Payment Term (days)</Label>
                <Input id="defaultPaymentTermDays" name="defaultPaymentTermDays" type="number" defaultValue={profile?.defaultPaymentTermDays?.toString() || "15"} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
              <CardDescription>Where should clients send their money?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Preferred Payment Method</Label>
                  <Input id="paymentMethod" name="paymentMethod" defaultValue={profile?.paymentMethod || ""} placeholder="e.g. Bank Transfer, UPI" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upiId">UPI ID</Label>
                  <Input id="upiId" name="upiId" defaultValue={profile?.upiId || ""} placeholder="you@bank" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input id="bankName" name="bankName" defaultValue={profile?.bankName || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number</Label>
                  <Input id="accountNumber" name="accountNumber" defaultValue={profile?.accountNumber || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="routingSwift">Routing / SWIFT</Label>
                  <Input id="routingSwift" name="routingSwift" defaultValue={profile?.routingSwift || ""} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Default Invoice Note</CardTitle>
              <CardDescription>
                Pre-filled into the Notes field of every new invoice, quotation and proforma.
                You can still change it on any individual document.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                id="defaultInvoiceNote"
                name="defaultInvoiceNote"
                rows={3}
                defaultValue={profile?.defaultInvoiceNote || ""}
                placeholder="Thank you for your business!"
                className="max-w-xl"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document Appearance</CardTitle>
              <CardDescription>
                How every invoice, quotation and contract is printed - on screen, in the PDF,
                and on the page your client opens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentAppearance
                paperColor={profile?.paperColor ?? null}
                documentFont={profile?.documentFont ?? null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contract Signature</CardTitle>
              <CardDescription>Shown as your counter-signature on contracts.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-sm">
                <Label htmlFor="signatureName">Signature Name</Label>
                <Input id="signatureName" name="signatureName" defaultValue={profile?.signatureName || ""} placeholder="Your name, as signed" className="font-serif italic" />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit">Save Changes</Button>
          </div>
        </div>
      </form>

      {/* Sections below are outside the profile form on purpose: a form cannot
          be nested inside another, and each of these saves independently. */}

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Light or dark for this app, remembered in this browser. It does not affect your
            documents - those follow Document Appearance above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelect />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            For {user.email}. You&apos;ll need your current password, and everywhere you&apos;re
            signed in stays signed in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={changePassword} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
              <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
            </div>
            {searchParams?.error && <p className="text-sm text-destructive">{searchParams.error}</p>}
            {searchParams?.updated === "1" && (
              <p className="text-sm text-muted-foreground">Password updated.</p>
            )}
            <SubmitButton idleLabel="Update password" pendingLabel="Updating..." />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Let another system - a CRM, an automation - push clients and draft documents into
            this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <KeyManager />

          {apiKeys.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Key</th>
                    <th className="p-3 font-medium">Last used</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="border-b transition-colors last:border-b-0 hover:bg-muted/50">
                      <td className="p-3 font-medium">{k.name}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{maskApiKey(k.lookupId)}</td>
                      <td className="p-3 text-muted-foreground">
                        {k.lastUsedAt ? k.lastUsedAt.toLocaleString() : "Never"}
                      </td>
                      <td className="p-3">
                        <Badge variant={k.revokedAt ? "destructive" : "secondary"}>
                          {k.revokedAt ? "Revoked" : "Active"}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {!k.revokedAt && <RevokeButton id={k.id} name={k.name} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
