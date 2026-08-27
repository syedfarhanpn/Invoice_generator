"use client"

import { Separator } from "@/components/ui/separator"
import type { DocumentType } from "@prisma/client"
import type { InvoiceContent, InvoiceLineItem } from "@/lib/types"
import { documentKind } from "@/lib/document-kinds"
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
  /** Drives the heading, the date label and whether bank details print. */
  type: DocumentType
  refNumber: string | null
  isDraft: boolean
  title: string | null
  issueDate: Date | string | null
  dueDate: Date | string | null
  currency: string
  taxMode: "NONE" | "PERCENTAGE"
  taxRate: number | null
  taxLabel: string | null
  /** Money already in hand before this document was raised. */
  advanceReceived?: number | null
  content: InvoiceContent
  issuer: PreviewIssuer | null
  client: PreviewClient | null | undefined
}

export default function InvoicePreview({
  type,
  refNumber,
  isDraft,
  title,
  issueDate,
  dueDate,
  currency,
  taxMode,
  taxRate,
  taxLabel,
  advanceReceived,
  content,
  issuer,
  client,
}: InvoicePreviewProps) {
  const kind = documentKind(type)
  const lineItems: InvoiceLineItem[] = content?.lineItems || []
  const totals = computeTotals(lineItems, currency, taxMode, taxRate)
  // Only shown when there is actually something to deduct, so an ordinary
  // one-off invoice looks exactly as it did before this feature existed.
  const advance = kind.supportsAdvance ? Math.max(0, Number(advanceReceived) || 0) : 0
  const showAdvance = advance > 0
  const balanceDue = Math.max(0, totals.total - advance)
  // Once an advance is deducted the document ends on Balance Due, so a Total
  // row that merely repeats the Subtotal is noise - drop it. It is kept when
  // tax makes the two differ, because a tax invoice still has to state its
  // full invoice value.
  const showTotalRow = !showAdvance || totals.total !== totals.subtotal
  // Only render the payment block if the issuer actually configured something -
  // otherwise the document shows a heading above empty space.
  const paymentLines = kind.showsPaymentDetails
    ? ([
        ["Method", issuer?.paymentMethod],
        ["Bank", issuer?.bankName],
        ["Account", issuer?.accountNumber],
        ["Routing/SWIFT", issuer?.routingSwift],
        ["UPI", issuer?.upiId],
      ] as const).filter(([, v]) => !!v)
    : []

  return (
    <div className="w-full min-h-[1000px] print:min-h-0 bg-background text-foreground flex flex-col font-sans relative">
      {isDraft && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden">
          <span className="text-[10rem] font-black text-muted-foreground/10 -rotate-12 select-none whitespace-nowrap">
            DRAFT
          </span>
        </div>
      )}

      {/* Sticky on screen so the reference number stays visible as line items
          push the document taller. print:static because a sticky element in a
          paged context repeats or floats out of place. */}
      <div
        className="sticky top-0 z-30 h-32 w-full flex items-end justify-between px-12 pb-8 text-white relative overflow-hidden print:static"
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
          <h1 className="text-5xl font-extrabold tracking-tight uppercase">{kind.heading}</h1>
        </div>
        <div className="z-10 text-right">
          <div className="text-sm font-medium opacity-80 uppercase tracking-widest mb-1">Reference</div>
          <div className="text-xl font-semibold tracking-wider">{refNumber || "Draft - unnumbered"}</div>
        </div>
      </div>

      <div className="px-12 pt-12 flex-1 flex flex-col">
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
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{kind.dateLabel}</div>
            <div className="font-medium">{dueDate ? new Date(dueDate).toLocaleDateString() : "-"}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Title</div>
            <div className="font-medium">{title || "Untitled"}</div>
          </div>
        </div>

        <div className="mb-12 flex-1">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-muted">
                <th className="w-1/2 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</th>
                <th className="w-[12%] py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-center">Qty</th>
                <th className="w-[19%] py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-right">Rate</th>
                <th className="w-[19%] py-3 text-[10px] font-bold uppercase tracking-widest text-foreground text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, i) => (
                <tr key={i} className="border-b border-muted/50">
                  <td className="py-4 pr-4 align-top font-medium break-words whitespace-pre-wrap">
                    {item.description || "-"}
                  </td>
                  <td className="py-4 align-top text-center text-muted-foreground whitespace-nowrap">{item.qty}</td>
                  <td className="py-4 align-top text-right text-muted-foreground whitespace-nowrap">{formatMoney(item.rate, currency)}</td>
                  <td className="py-4 align-top text-right font-semibold whitespace-nowrap">{formatMoney(lineAmount(item, currency), currency)}</td>
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
              {/* Tax applies to the full invoice value, so the advance is
                  deducted AFTER the total, never before the tax line. */}
              {showTotalRow && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className={showAdvance ? "font-semibold text-base uppercase tracking-wider" : "font-bold text-lg uppercase tracking-wider"}>
                      Total
                    </span>
                    <span className={showAdvance ? "font-bold text-lg" : "font-extrabold text-2xl"}>
                      {formatMoney(totals.total, currency)}
                    </span>
                  </div>
                </>
              )}
              {showAdvance && (
                <>
                  {!showTotalRow && <Separator />}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Less: amount received</span>
                    <span className="font-medium">-{formatMoney(advance, currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg uppercase tracking-wider">Balance Due</span>
                    <span className="font-extrabold text-2xl">{formatMoney(balanceDue, currency)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Document footer. mt-auto pins it to the bottom of the page when the
            document is short; it flows naturally once line items fill the page.
            The band is full-bleed (-mx-12) so it reads as a footer rather than
            one more content row. */}
        <div className="mt-auto pt-12">
          {kind.disclaimer && (
            <div className="mb-6 rounded-md border border-muted-foreground/20 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              {kind.disclaimer}
            </div>
          )}

          <div className="-mx-12 border-t border-muted/60 bg-muted/20 px-12 pt-8 pb-10">
            <div
              className={`grid gap-x-16 gap-y-8 text-sm ${
                paymentLines.length > 0 ? "sm:grid-cols-2" : "grid-cols-1"
              }`}
            >
              {paymentLines.length > 0 && (
                <div>
                  <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Payment Details
                  </div>
                  <dl className="space-y-1.5">
                    {paymentLines.map(([label, value]) => (
                      <div key={label} className="flex gap-3">
                        <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                        <dd className="font-medium break-all">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div>
                <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Notes
                </div>
                <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {content?.notes || <span className="italic opacity-60">No notes</span>}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
