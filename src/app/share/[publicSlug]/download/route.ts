import { renderToBuffer } from "@react-pdf/renderer"
import { NextResponse, type NextRequest } from "next/server"

import prisma from "@/lib/db"
import { documentKind } from "@/lib/document-kinds"
import { InvoicePdf } from "@/lib/pdf/invoice-pdf"
import { publicSlugSchema } from "@/lib/share-validation"
import type { ClientSnapshot, InvoiceContent, IssuerSnapshot } from "@/lib/types"
import { getViewerFingerprint } from "@/lib/request-info"

/**
 * Serves the document as a real PDF file.
 *
 * Replaces window.print(), which paginated differently per browser and could
 * orphan the payment footer across a page break. Rendered on the server so
 * every recipient gets identical output regardless of their setup.
 *
 * Public by design: the publicSlug is the capability, exactly as it is for
 * viewing the document.
 */

const LOG_DEDUPE_WINDOW_MS = 60 * 60 * 1000

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ publicSlug: string }> }
) {
  const { publicSlug } = await ctx.params
  const slug = publicSlugSchema.safeParse(publicSlug)
  if (!slug.success) return new NextResponse("Not found", { status: 404 })

  const document = await prisma.document.findUnique({
    where: { publicSlug: slug.data },
    include: { client: true },
  })
  // A draft never has a share link; this is the backstop if one ever leaks.
  if (!document || document.status === "DRAFT") {
    return new NextResponse("Not found", { status: 404 })
  }

  const kind = documentKind(document.type)
  if (!kind.isLineItemDoc) {
    // Contracts render from a different template and have no PDF export yet.
    return new NextResponse("This document type has no PDF export yet.", { status: 501 })
  }

  const businessProfile = await prisma.businessProfile.findUnique({
    where: { userId: document.userId },
  })

  const content = document.content as unknown as InvoiceContent
  // Prefer the snapshot frozen at finalize time, so a later edit to the
  // business profile never rewrites a document that has already gone out.
  const issuer = (content?.snapshot?.issuer ?? businessProfile) as IssuerSnapshot | null
  const client = (content?.snapshot?.client ?? document.client) as ClientSnapshot | null

  const buffer = await renderToBuffer(
    InvoicePdf({
      type: document.type,
      refNumber: document.refNumber,
      isDraft: false,
      title: document.title,
      issueDate: document.issueDate,
      dueDate: document.dueDate,
      currency: document.currency,
      taxMode: document.taxMode,
      taxRate: document.taxRate != null ? Number(document.taxRate) : null,
      taxLabel: document.taxLabel,
      advanceReceived: Number(document.advanceReceived),
      content,
      issuer,
      client,
    })
  )

  // Telemetry, bounded the same way the view log is, and never blocking.
  try {
    const { hash, userAgent } = await getViewerFingerprint()
    const recent = await prisma.documentActivity.findFirst({
      where: {
        documentId: document.id,
        event: "downloaded",
        createdAt: { gte: new Date(Date.now() - LOG_DEDUPE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
      select: { meta: true },
    })
    if ((recent?.meta as { viewerHash?: string } | null)?.viewerHash !== hash) {
      await prisma.documentActivity.create({
        data: { documentId: document.id, event: "downloaded", meta: { viewerHash: hash, userAgent } },
      })
    }
  } catch {
    // Logging must never break the download.
  }

  const safeName = (document.refNumber || kind.label).replace(/[^A-Za-z0-9._-]+/g, "-")

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      // `attachment` is what makes the browser save the file instead of
      // rendering it inline in a tab.
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  })
}
