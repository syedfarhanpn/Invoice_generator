import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import prisma from "@/lib/db"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/current-user"
import { CURRENCIES } from "@/lib/currencies"

export default async function BusinessProfileSettings() {
  const user = await getCurrentUser()

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
  })

  async function updateProfile(formData: FormData) {
    "use server"
    const userId = user?.id
    if (!userId) return

    const taxMode = (formData.get("defaultTaxMode") as string) === "PERCENTAGE" ? "PERCENTAGE" : "NONE"
    const taxRateRaw = formData.get("defaultTaxRate") as string
    const paymentTermRaw = formData.get("defaultPaymentTermDays") as string

    const data = {
      businessName: formData.get("businessName") as string,
      logoUrl: formData.get("logoUrl") as string,
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
      defaultPaymentTermDays: paymentTermRaw ? parseInt(paymentTermRaw, 10) : null,
      signatureName: (formData.get("signatureName") as string) || null,
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
                <div className="space-y-2">
                  <Label htmlFor="logoUrl">Logo URL (Optional)</Label>
                  <Input id="logoUrl" name="logoUrl" defaultValue={profile?.logoUrl || ""} placeholder="https://..." />
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
              <CardDescription>Pre-fills every new invoice - still editable per document while it's a draft.</CardDescription>
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
    </div>
  )
}
