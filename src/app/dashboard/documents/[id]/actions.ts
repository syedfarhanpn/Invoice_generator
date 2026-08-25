"use server"

import prisma from "@/lib/db"
import type { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/current-user"
import { allocateRef } from "@/lib/allocate-ref"
import { buildSnapshot } from "@/lib/snapshot"
import { hashContent } from "@/lib/hash"
import { generatePublicSlug } from "@/lib/slug"
import { computeTotals } from "@/lib/money"
import type { InvoiceContent, ContractContent } from "@/lib/types"

async function loadOwnedDocument(id: string, userId: string) {
  const doc = await prisma.document.findUnique({ where: { id, userId } })
  if (!doc) throw new Error("Document not found")
  return doc
}

// ---------------------------------------------------------------------------
// Draft editing - blocked entirely once a document leaves DRAFT. Finalized
// documents are frozen snapshots (see src/lib/snapshot.ts); this is the
// server-side enforcement of that, not just a disabled button in the UI.
// ---------------------------------------------------------------------------
export type UpdateDocumentInput = {
  title?: string
  clientId?: string | null
  issueDate?: Date | null
  dueDate?: Date | null
  currency: string
  taxMode: "NONE" | "PERCENTAGE"
  taxRate?: number | null
  taxLabel?: string | null
  content: InvoiceContent | ContractContent
}

export async function updateDocument(id: string, data: UpdateDocumentInput) {
  const user = await getCurrentUser()
  const doc = await loadOwnedDocument(id, user.id)

  if (doc.status !== "DRAFT") {
    throw new Error("This document is finalized and can no longer be edited.")
  }

  let subtotal: number | null = null
  let taxAmount: number | null = null
  let totalAmount: number | null = null

  if (doc.type === "INVOICE") {
    const content = data.content as InvoiceContent
    const totals = computeTotals(content.lineItems || [], data.currency, data.taxMode, data.taxRate)
    subtotal = totals.subtotal
    taxAmount = totals.taxAmount
    totalAmount = totals.total
  } else if (doc.type === "CONTRACT") {
    const content = data.content as ContractContent
    totalAmount = content.totalFee != null ? Number(content.totalFee) : null
  }

  await prisma.document.update({
    where: { id },
    data: {
      title: data.title,
      clientId: data.clientId || null,
      issueDate: data.issueDate ?? null,
      dueDate: data.dueDate ?? null,
      currency: data.currency,
      taxMode: data.taxMode,
      taxRate: data.taxMode === "PERCENTAGE" ? data.taxRate : null,
      taxLabel: data.taxMode === "PERCENTAGE" ? data.taxLabel : null,
      content: data.content as unknown as Prisma.InputJsonValue,
      subtotal,
      taxAmount,
      totalAmount,
    },
  })

  revalidatePath(`/dashboard/documents/${id}`)
}

// ---------------------------------------------------------------------------
// Finalize: allocates the serial number, freezes issuer/client details into
// the content snapshot, computes final totals, and issues a share link -
// all in one transaction so a document is never left half-numbered.
// ---------------------------------------------------------------------------
export async function finalizeDocument(id: string) {
  const user = await getCurrentUser()
  const doc = await prisma.document.findUnique({
    where: { id, userId: user.id },
    include: { client: true },
  })
  if (!doc) throw new Error("Document not found")
  if (doc.status !== "DRAFT") throw new Error("This document is already finalized.")
  if (!doc.clientId || !doc.client) {
    throw new Error("Select a client before finalizing - it's required to allocate the serial number.")
  }

  if (doc.type === "INVOICE") {
    const content = doc.content as unknown as InvoiceContent
    const hasLineItem = (content.lineItems || []).some((li) => li.description?.trim())
    if (!hasLineItem) throw new Error("Add at least one line item before finalizing.")
  } else if (doc.type === "CONTRACT") {
    const content = doc.content as unknown as ContractContent
    const hasClause = (content.clauses || []).some((c) => c.body?.trim())
    if (!hasClause) throw new Error("Add at least one clause before finalizing.")
  }

  const businessProfile = await prisma.businessProfile.findUnique({ where: { userId: user.id } })

  await prisma.$transaction(async (tx) => {
    const { refNumber, sequence } = await allocateRef(tx, doc.clientId!, doc.type)
    const snapshot = buildSnapshot(businessProfile, doc.client)
    const contentWithSnapshot = { ...(doc.content as object), snapshot }
    const contentHash = hashContent(contentWithSnapshot)
    const publicSlug = generatePublicSlug()

    await tx.document.update({
      where: { id },
      data: {
        status: "FINALIZED",
        refNumber,
        sequence,
        finalizedAt: new Date(),
        content: contentWithSnapshot as unknown as Prisma.InputJsonValue,
        contentHash,
        publicSlug,
        slugRevokedAt: null,
      },
    })

    await tx.documentActivity.create({
      data: { documentId: id, event: "finalized", meta: { refNumber } },
    })
  })

  revalidatePath(`/dashboard/documents/${id}`)
  revalidatePath("/dashboard/documents")
  revalidatePath("/dashboard")
}

// ---------------------------------------------------------------------------
// Share link management
// ---------------------------------------------------------------------------
export async function regenerateShareLink(id: string) {
  const user = await getCurrentUser()
  const doc = await loadOwnedDocument(id, user.id)
  if (doc.status === "DRAFT") throw new Error("Finalize the document before sharing it.")

  const publicSlug = generatePublicSlug()
  await prisma.document.update({
    where: { id },
    data: { publicSlug, slugRevokedAt: null },
  })
  await prisma.documentActivity.create({ data: { documentId: id, event: "shared" } })
  revalidatePath(`/dashboard/documents/${id}`)
}

export async function revokeShareLink(id: string) {
  const user = await getCurrentUser()
  await loadOwnedDocument(id, user.id)

  await prisma.document.update({
    where: { id },
    data: { publicSlug: null, slugRevokedAt: new Date() },
  })
  revalidatePath(`/dashboard/documents/${id}`)
}

// ---------------------------------------------------------------------------
// Void / delete
// ---------------------------------------------------------------------------
export async function voidDocument(id: string) {
  const user = await getCurrentUser()
  const doc = await loadOwnedDocument(id, user.id)
  if (doc.status !== "FINALIZED" && doc.status !== "SIGNED") {
    throw new Error("Only a finalized document can be voided.")
  }

  await prisma.document.update({
    where: { id },
    data: { status: "VOID", publicSlug: null, slugRevokedAt: new Date() },
  })
  await prisma.documentActivity.create({ data: { documentId: id, event: "voided" } })
  revalidatePath(`/dashboard/documents/${id}`)
  revalidatePath("/dashboard/documents")
}

export async function deleteDraftDocument(id: string) {
  const user = await getCurrentUser()
  const doc = await loadOwnedDocument(id, user.id)
  if (doc.status !== "DRAFT") {
    throw new Error("Only a draft can be deleted - void a finalized document instead, to keep its number allocated.")
  }
  await prisma.document.delete({ where: { id } })
  revalidatePath("/dashboard/documents")
}

// ---------------------------------------------------------------------------
// Payments - amountPaid is always recomputed as SUM(Payment.amount), never
// incremented in place, so it can't drift if a payment is later removed.
// ---------------------------------------------------------------------------
export type RecordPaymentInput = {
  amount: number
  paidOn: Date
  method?: string
  reference?: string
  note?: string
}

async function resyncAmountPaid(tx: Prisma.TransactionClient, documentId: string) {
  const agg = await tx.payment.aggregate({
    where: { documentId },
    _sum: { amount: true },
  })
  await tx.document.update({
    where: { id: documentId },
    data: { amountPaid: agg._sum.amount ?? 0 },
  })
}

export async function recordPayment(documentId: string, input: RecordPaymentInput) {
  const user = await getCurrentUser()
  const doc = await loadOwnedDocument(documentId, user.id)
  if (doc.type !== "INVOICE") throw new Error("Payments can only be recorded on invoices.")
  if (doc.status === "DRAFT") throw new Error("Finalize the invoice before recording a payment.")
  if (!(input.amount > 0)) throw new Error("Payment amount must be greater than zero.")

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        documentId,
        amount: input.amount,
        paidOn: input.paidOn,
        method: input.method || null,
        reference: input.reference || null,
        note: input.note || null,
      },
    })
    await resyncAmountPaid(tx, documentId)
    await tx.documentActivity.create({
      data: { documentId, event: "payment_recorded", meta: { amount: input.amount } },
    })
  })

  revalidatePath(`/dashboard/documents/${documentId}`)
  revalidatePath("/dashboard/documents")
  revalidatePath("/dashboard")
}

export async function deletePayment(documentId: string, paymentId: string) {
  const user = await getCurrentUser()
  await loadOwnedDocument(documentId, user.id)

  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } })
    await resyncAmountPaid(tx, documentId)
  })

  revalidatePath(`/dashboard/documents/${documentId}`)
  revalidatePath("/dashboard")
}
