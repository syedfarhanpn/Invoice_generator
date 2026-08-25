"use client"

import { Separator } from "@/components/ui/separator"
import type { BusinessProfile, Client } from "@prisma/client"
import type { InvoiceContent, InvoiceLineItem } from "@/lib/types"
import { computeTotals, formatMoney, lineAmount } from "@/lib/money"

type PreviewIssuer = {
  businessName: string
  ownerName?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  logoUrl?: string | null
  brandColor?: string | null
  paymentMethod?: string | null
  bankName?: string | null
  accountNumber?: string | null
  routingSwift?: string | null
  upiId?: string | null
}

type PreviewClient = {
  fullName: string
  businessName?: string | null
  email?: string | null
  address?: string | null
  taxId?: string | null
}

type InvoicePreviewProps = {
  refNumber: string | null
  isDraft: boolean
  title: string | null
  issueDate: Date | string | null
  dueDate: Date | string | null
  currency: string
  taxMode: "NONE" | "PERCENTAGE"
  taxRate: number | null
  taxLabel: string | null
  content: InvoiceContent
  issuer: PreviewIssuer | null
  client: PreviewClient | null | undefined
}

export default function InvoicePreview({
  refNumber,
  isDraft,
  title,
  issueDate,
  dueDate,
  currency,
  taxMode,
  taxRate,
  taxLabel,
  content,
  issuer,
  client,
}: InvoicePreviewProps) {
  const lineItems: InvoiceLineItem[] = content?.lineItems || []
  const totals = computeTotals(lineItems, currency, taxMode, taxRate)

  return (
    <div className="w-full h-full bg-background text-foreground flex flex-col font-sans relative">
      {isDraft && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden">
          <span className="text-[10rem] font-black text-muted-foreground/10 -rotate-12 select-none whitespace-nowrap">
            DRAFT
          </span>
        </div>
      )}

      <div
        className="h-32 w-full flex items-end justify-between px-12 pb-8 text-white relative overflow-hidden"
        style={{ backgroundColor: issuer?.brandColor || "#000" }}
      >
        <div className="absolute inset-0 opacity-20 bg-gradient-to-r from-transparent to-white/40 mix-blend-overlay"></div>
        <div className="z-10 flex items-center gap-6">
          {issuer?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={issuer.logoUrl}
              alt="Business Logo"
              className="h-16 w-auto object-contain bg-white/10 rounded backdrop-blur-sm p-2"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          )}
          <h1 className="text-5xl font-extrabold tracking-tight uppercase">Invoice</h1>
        </div>
        <div className="z-10 text-right">
          <div className="text-sm font-medium opacity-80 uppercase tracking-widest mb-1">Reference</div>
          <div className="text-xl font-semibold tracking-wider">{refNumber || "Draft - unnumbered"}</div>
        </div>
      </div>

      <div className="px-12 py-12 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-16 gap-8">
          <div className="space-y-4 max-w-xs">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">From</div>
            <div>
              <div className="font-bold text-lg mb-1">{issuer?.businessName || "Your Business Name"}</div>
              <div className="text-sm text-muted-foreground space-y-1">
                {issuer?.ownerName && <div>{issuer.ownerName}</div>}
                {issuer?.email && <div>{issuer.email}</div>}
                {issuer?.address && <div className="whitespace-pre-wrap">{issuer.address}</div>}
              </div>
            </div>
          </div>

          <div className="space-y-4 max-w-xs text-right">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bill To</div>
            {client ? (
              <div>
                <div className="font-bold text-lg mb-1">{client.businessName || client.fullName}</div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {client.businessName && client.fullName !== client.businessName && <div>{client.fullName}</div>}
                  {client.email && <div>{client.email}</div>}
                  {client.address && <div className="whitespace-pre-wrap">{client.address}</div>}
                  {client.taxId && <div>Tax ID: {client.taxId}</div>}
                </div>
              </div>
            ) : (
              <div className="text-sm italic text-muted-foreground">No client selected</div>
            )}
          </div>
        </div>

        <div className="flex gap-16 mb-12">
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Issue Date</div>
            <div className="font-medium">{issueDate ? new Date(issueDate).toLocaleDateString() : "-"}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Due Date</div>
            <div className="font-medium">{dueDate ? new Date(dueDate).toLocaleDateString() : "-"}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Title</div>
            <div className="font-medium">{title || "Untitled"}</div>
          </div>
        </div>

        <div className="mb-12 flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-muted">
                <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</th>
                <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Qty</th>
                <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">Rate</th>
                <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-foreground text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i} className="border-b border-muted/50">
                  <td className="py-4 font-medium">{item.description || "-"}</td>
                  <td className="py-4 text-center text-muted-foreground">{item.qty}</td>
                  <td className="py-4 text-right text-muted-foreground">{formatMoney(item.rate, currency)}</td>
                  <td className="py-4 text-right font-semibold">{formatMoney(lineAmount(item, currency), currency)}</td>
                </tr>
              ))}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">No line items yet</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex justify-end mt-6">
            <div className="w-72 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatMoney(totals.subtotal, currency)}</span>
              </div>
              {taxMode === "PERCENTAGE" && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{taxLabel || "Tax"} ({taxRate ?? 0}%)</span>
                  <span className="font-medium">{formatMoney(totals.taxAmount, currency)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg uppercase tracking-wider">Total</span>
                <span className="font-extrabold text-2xl">{formatMoney(totals.total, currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 text-sm mt-auto pt-8 border-t border-muted/50">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Payment Details</div>
            <div className="space-y-1 text-muted-foreground">
              {issuer?.paymentMethod && <div>Method: <span className="font-medium text-foreground">{issuer.paymentMethod}</span></div>}
              {issuer?.bankName && <div>Bank: <span className="font-medium text-foreground">{issuer.bankName}</span></div>}
              {issuer?.accountNumber && <div>Account: <span className="font-medium text-foreground">{issuer.accountNumber}</span></div>}
              {issuer?.routingSwift && <div>Routing/SWIFT: <span className="font-medium text-foreground">{issuer.routingSwift}</span></div>}
              {issuer?.upiId && <div>UPI: <span className="font-medium text-foreground">{issuer.upiId}</span></div>}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Notes</div>
            <div className="text-muted-foreground whitespace-pre-wrap">{content?.notes || ""}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
