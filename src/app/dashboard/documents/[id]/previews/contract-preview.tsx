"use client"

import type { ContractContent } from "@/lib/types"
import { formatMoney } from "@/lib/money"
import { formatDocumentDate, formatDocumentDateTime } from "@/lib/dates"
import { DocumentSurface, SIGNATURE_PANEL_STYLE } from "@/components/app/document-surface"
import type { DocumentAppearanceSettings } from "@/lib/document-theme"

type PreviewIssuer = {
  businessName: string
  ownerName?: string | null
  email?: string | null
  address?: string | null
  signatureName?: string | null
}

type PreviewClient = {
  fullName: string
  businessName?: string | null
  email?: string | null
  address?: string | null
}

type SignaturePayload = {
  method: "typed" | "drawn"
  typedName?: string
  drawnDataUrl?: string
  signedAt: string
}

export default function ContractPreview({
  refNumber,
  isDraft,
  title,
  issueDate,
  currency,
  content,
  issuer,
  client,
  signature,
  appearance,
}: {
  refNumber: string | null
  isDraft: boolean
  title: string | null
  issueDate: Date | string | null
  currency: string
  content: ContractContent
  issuer: PreviewIssuer | null
  client: PreviewClient | null | undefined
  signature?: SignaturePayload | null
  /** Live paper and typeface - see @/lib/document-theme. */
  appearance?: DocumentAppearanceSettings | null
}) {
  return (
    <DocumentSurface
      paper={appearance?.paperColor}
      font={appearance?.documentFont}
      className="w-full h-full flex flex-col relative"
    >
      {isDraft && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden">
          <span className="text-[10rem] font-black text-muted-foreground/10 -rotate-12 select-none whitespace-nowrap">
            DRAFT
          </span>
        </div>
      )}

      <div className="px-12 pt-12 pb-8 border-b">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          {refNumber || "Draft - unnumbered"}
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">{title || "Service Agreement"}</h1>
        <div className="text-sm text-muted-foreground mt-2">
          {issueDate ? `Effective ${formatDocumentDate(issueDate)}` : "Effective date not set"}
        </div>
      </div>

      <div className="px-12 py-8 grid grid-cols-2 gap-8 border-b text-sm">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Between</div>
          <div className="font-semibold">{issuer?.businessName || "Your Business Name"}</div>
          {issuer?.address && <div className="text-muted-foreground whitespace-pre-wrap">{issuer.address}</div>}
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">And</div>
          {client ? (
            <>
              <div className="font-semibold">{client.businessName || client.fullName}</div>
              {client.address && <div className="text-muted-foreground whitespace-pre-wrap">{client.address}</div>}
            </>
          ) : (
            <div className="text-muted-foreground italic">No client selected</div>
          )}
        </div>
      </div>

      <div className="px-12 py-8 flex-1 space-y-8">
        {content.scopeSummary && (
          <p className="text-sm text-muted-foreground">{content.scopeSummary}</p>
        )}

        {(content.clauses || []).map((clause, i) => (
          <div key={i} className="space-y-2">
            <h3 className="font-bold text-sm uppercase tracking-wide">
              {i + 1}. {clause.title || "Untitled Clause"}
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{clause.body}</p>
          </div>
        ))}

        {content.totalFee != null && (
          <div className="flex justify-between items-center border-t pt-4">
            <span className="font-bold uppercase tracking-wide text-sm">Total Fee</span>
            <span className="font-extrabold text-xl">{formatMoney(content.totalFee, currency)}</span>
          </div>
        )}
        {content.feeNote && <p className="text-xs text-muted-foreground">{content.feeNote}</p>}
      </div>

      <div className="px-12 py-8 border-t grid grid-cols-2 gap-8 text-sm">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            {issuer?.businessName || "Provider"}
          </div>
          <div
            className="h-16 flex items-end rounded-md border px-3 py-2"
            style={SIGNATURE_PANEL_STYLE}
          >
            {issuer?.signatureName ? (
              <span className="font-serif italic text-xl">{issuer.signatureName}</span>
            ) : (
              <span className="text-xs opacity-45">Not yet counter-signed</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            {client?.businessName || client?.fullName || "Client"}
          </div>
          <div
            className="h-16 flex items-end rounded-md border px-3 py-2"
            style={SIGNATURE_PANEL_STYLE}
          >
            {signature ? (
              signature.method === "drawn" && signature.drawnDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signature.drawnDataUrl} alt="Signature" className="h-14 object-contain" />
              ) : (
                <span className="font-serif italic text-xl">{signature.typedName}</span>
              )
            ) : (
              <span className="text-xs opacity-45">Awaiting signature</span>
            )}
          </div>
          {signature && (
            <div className="text-[10px] text-muted-foreground mt-1">
              Signed {formatDocumentDateTime(signature.signedAt)}
            </div>
          )}
        </div>
      </div>
    </DocumentSurface>
  )
}
