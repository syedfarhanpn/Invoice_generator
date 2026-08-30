"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { canDeleteClient, canDeleteDocument, canVoidDocument } from "@/lib/bulk-actions"

/**
 * Bulk operations for the list pages.
 *
 * Every one of these re-derives eligibility from the database rather than
 * trusting the ids it was handed. The UI greys out what it cannot do, but a
 * server action is a public endpoint - the checkbox state is a hint, never a
 * permission.
 */

const idsSchema = z.array(z.string().min(1).max(64)).min(1).max(200)

export type BulkResult = {
  /** How many rows the action actually applied to. */
  changed: number
  /** How many were selected but not eligible. */
  skipped: number
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Deletes selected DRAFT documents. Issued documents are skipped, not deleted. */
export async function bulkDeleteDocuments(ids: string[]): Promise<BulkResult> {
  const user = await getCurrentUser()
  const parsed = idsSchema.safeParse(ids)
  if (!parsed.success) throw new Error("Nothing valid was selected.")

  const rows = await prisma.document.findMany({
    where: { id: { in: parsed.data }, userId: user.id },
    select: { id: true, status: true },
  })

  const deletable = rows.filter((r) => canDeleteDocument(r.status)).map((r) => r.id)

  // Scoped by userId as well as id: the where clause is the tenant boundary,
  // not the fact that we just read these rows.
  const { count } = deletable.length
    ? await prisma.document.deleteMany({
        where: { id: { in: deletable }, userId: user.id, status: "DRAFT" },
      })
    : { count: 0 }

  revalidatePath("/dashboard/documents")
  revalidatePath("/dashboard")
  return { changed: count, skipped: parsed.data.length - count }
}

/** Voids selected FINALIZED/SIGNED documents, keeping their serial allocated. */
export async function bulkVoidDocuments(ids: string[]): Promise<BulkResult> {
  const user = await getCurrentUser()
  const parsed = idsSchema.safeParse(ids)
  if (!parsed.success) throw new Error("Nothing valid was selected.")

  const rows = await prisma.document.findMany({
    where: { id: { in: parsed.data }, userId: user.id },
    select: { id: true, status: true },
  })
  const voidable = rows.filter((r) => canVoidDocument(r.status)).map((r) => r.id)
  if (voidable.length === 0) {
    return { changed: 0, skipped: parsed.data.length }
  }

  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.document.updateMany({
      // Status is re-asserted in the UPDATE itself, so a document finalized or
      // voided between the read and the write cannot be caught by surprise.
      where: { id: { in: voidable }, userId: user.id, status: { in: ["FINALIZED", "SIGNED"] } },
      data: { status: "VOID", publicSlug: null, slugRevokedAt: new Date() },
    })
    await tx.documentActivity.createMany({
      data: voidable.map((documentId) => ({ documentId, event: "voided" })),
    })
    return count
  })

  revalidatePath("/dashboard/documents")
  revalidatePath("/dashboard")
  return { changed, skipped: parsed.data.length - changed }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/**
 * Deletes selected clients that have never been billed.
 *
 * Client -> Document is ON DELETE CASCADE, so deleting a client with documents
 * would take their invoices and payment history with it. Those are skipped and
 * must be archived instead.
 */
export async function bulkDeleteClients(ids: string[]): Promise<BulkResult> {
  const user = await getCurrentUser()
  const parsed = idsSchema.safeParse(ids)
  if (!parsed.success) throw new Error("Nothing valid was selected.")

  const rows = await prisma.client.findMany({
    where: { id: { in: parsed.data }, userId: user.id },
    select: { id: true, _count: { select: { documents: true } } },
  })

  const deletable = rows.filter((r) => canDeleteClient(r._count.documents)).map((r) => r.id)
  if (deletable.length === 0) {
    return { changed: 0, skipped: parsed.data.length }
  }

  // The `documents: { none: {} }` guard is the real protection: even if a
  // document were created between the read above and this delete, the row
  // would no longer match and would be left alone.
  const { count } = await prisma.client.deleteMany({
    where: { id: { in: deletable }, userId: user.id, documents: { none: {} } },
  })

  revalidatePath("/dashboard/clients")
  return { changed: count, skipped: parsed.data.length - count }
}

/** Archives selected clients - always safe, and reversible. */
export async function bulkArchiveClients(ids: string[], archived: boolean): Promise<BulkResult> {
  const user = await getCurrentUser()
  const parsed = idsSchema.safeParse(ids)
  if (!parsed.success) throw new Error("Nothing valid was selected.")

  const { count } = await prisma.client.updateMany({
    where: { id: { in: parsed.data }, userId: user.id },
    data: { archivedAt: archived ? new Date() : null },
  })

  revalidatePath("/dashboard/clients")
  return { changed: count, skipped: parsed.data.length - count }
}
