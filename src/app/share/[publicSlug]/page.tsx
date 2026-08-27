import prisma from "@/lib/db"
import { notFound } from "next/navigation"
import InvoicePreview from "@/app/dashboard/documents/[id]/previews/invoice-preview"
import ContractPreview from "@/app/dashboard/documents/[id]/previews/contract-preview"
import DownloadButton from "./download-button"
import { getViewerFingerprint } from "@/lib/request-info"
import type { InvoiceContent, ContractContent, SignaturePayload } from "@/lib/types"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { documentKind } from "@/lib/document-kinds"

const VIEW_DEDUPE_WINDOW_MS = 60 * 60 * 1000 // 1 hour

async function logViewOnce(documentId: string) {
  const { hash, userAgent } = await getViewerFingerprint()
  const since = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MS)

  const recent = await prisma.documentActivity.findFirst({
    where: {
      documentId,
      event: "viewed",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
  })

  const recentMeta = recent?.meta as { viewerHash?: string } | null
  if (recentMeta?.viewerHash === hash) return

  await prisma.documentActivity.create({
    data: { documentId, event: "viewed", meta: { viewerHash: hash, userAgent } },
  })
}

export default async function SharedDocumentPage(props: { params: Promise<{ publicSlug: string }> }) {
  const params = await props.params
  const document = await prisma.document.findUnique({
    where: { publicSlug: params.publicSlug },
    include: { client: true },
  })

  // Guards against: unknown slug, a revoked link (publicSlug nulled out),
  // and a draft (should never have a slug, but this is the hard backstop -
  // see finalizeDocument in src/app/dashboard/documents/[id]/actions.ts).
  if (!document || document.status === "DRAFT") return notFound()

  await logViewOnce(document.id)

  const businessProfile = await prisma.businessProfile.findUnique({ where: { userId: document.userId } })

  // Quotes and proformas render through the invoice preview too - anything
  // priced with line items does. Only contracts use the clause preview.
  const isLineItemDoc = documentKind(document.type).isLineItemDoc
  const content = document.content as unknown as InvoiceContent | ContractContent
  const snapshot = content?.snapshot

  // Prefer the frozen snapshot taken at finalize time; fall back to live
  // data only for the rare pre-migration document that predates snapshots.
  const issuer = snapshot?.issuer ?? businessProfile
  const client = snapshot?.client ?? document.client

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-[800px] flex justify-between items-center mb-6 no-print">
        <div className="text-xl font-bold">{issuer?.businessName}</div>
        <div className="flex gap-2">
          {document.type === "CONTRACT" && document.status === "FINALIZED" && (
            <Link href={`/share/${params.publicSlug}/sign`} className={buttonVariants({ variant: "outline" })}>
              Review &amp; Sign
            </Link>
          )}
          <DownloadButton publicSlug={params.publicSlug} />
        </div>
      </div>

      <div className="print-area w-full max-w-[800px] bg-background shadow-xl border">
        {isLineItemDoc ? (
          <InvoicePreview
            type={document.type}
            refNumber={document.refNumber}
            isDraft={false}
            title={document.title}
            issueDate={document.issueDate}
            dueDate={document.dueDate}
            currency={document.currency}
            taxMode={document.taxMode}
            taxRate={document.taxRate != null ? Number(document.taxRate) : null}
            taxLabel={document.taxLabel}
            advanceReceived={Number(document.advanceReceived)}
            content={content as InvoiceContent}
            issuer={issuer}
            client={client}
          />
        ) : (
          <ContractPreview
            refNumber={document.refNumber}
            isDraft={false}
            title={document.title}
            issueDate={document.issueDate}
            currency={document.currency}
            content={content as ContractContent}
            issuer={issuer ? { ...issuer, signatureName: businessProfile?.signatureName } : null}
            client={client}
            signature={document.signatureData as unknown as SignaturePayload | null}
          />
        )}
      </div>
    </div>
  )
}
