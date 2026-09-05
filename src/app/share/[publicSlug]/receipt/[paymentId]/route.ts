import { renderToBuffer } from "@react-pdf/renderer"
import { NextResponse, type NextRequest } from "next/server"

import prisma from "@/lib/db"
import { ReceiptPdf } from "@/lib/pdf/receipt-pdf"
import { publicSlugSchema } from "@/lib/share-validation"
import type { ClientSnapshot, InvoiceContent, IssuerSnapshot } from "@/lib/types"

/**
 * Serves a payment receipt as a PDF.
 *
 * Scoped under the invoice's own share link: whoever can see the invoice can
 * see receipts for it, and nobody else. The payment is looked up *through* the
 * document rather than by id alone, so a valid slug can never be paired with a
 * payment belonging to a different invoice.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ publicSlug: string; paymentId: string }> }
) {
  const { publicSlug, paymentId } = await ctx.params

  const slug = publicSlugSchema.safeParse(publicSlug)
  if (!slug.success) return new NextResponse("Not found", { status: 404 })

  const document = await prisma.document.findUnique({
    where: { publicSlug: slug.data },
    include: {
      client: true,
      // The payment must belong to THIS document; an id from elsewhere finds
      // nothing rather than leaking another invoice's payment.
      payments: { where: { id: paymentId } },
    },
  })
  if (!document || document.status === "DRAFT") {
    return new NextResponse("Not found", { status: 404 })
  }

  const payment = document.payments[0]
  if (!payment) return new NextResponse("Not found", { status: 404 })

  const businessProfile = await prisma.businessProfile.findUnique({
    where: { userId: document.userId },
  })

  const content = document.content as unknown as InvoiceContent
  // Prefer the snapshot frozen at finalize time, so the receipt shows the same
  // business and client details the invoice went out with.
  const issuer = (content?.snapshot?.issuer ?? businessProfile) as IssuerSnapshot | null
  const client = (content?.snapshot?.client ?? document.client) as ClientSnapshot | null

  const buffer = await renderToBuffer(
    ReceiptPdf({
      receiptNumber: payment.receiptNumber,
      paidOn: payment.paidOn,
      amount: Number(payment.amount),
      method: payment.method,
      reference: payment.reference,
      note: payment.note,
      currency: document.currency,
      invoiceRef: document.refNumber,
      invoiceTotal: document.totalAmount != null ? Number(document.totalAmount) : null,
      // amountPaid is always the resynced SUM(payments), so this includes the
      // payment being receipted plus any advance carried onto the invoice.
      totalReceived: Number(document.amountPaid) + Number(document.advanceReceived),
      issuer,
      client,
    })
  )

  const safeName = (payment.receiptNumber || `receipt-${payment.id}`).replace(/[^A-Za-z0-9._-]+/g, "-")

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  })
}
