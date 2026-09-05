import type { DocumentType, Prisma } from "@prisma/client"

import { documentKind } from "./document-kinds"

// Allowlist for the column name interpolated into the raw SQL below. The
// value already comes from a hardcoded config table, but the query is built
// by string interpolation, so it is checked against this list before use.
const SEQ_COLUMNS = ["invoiceSeq", "contractSeq", "quoteSeq", "proformaSeq", "receiptSeq"] as const

function pad(n: number): string {
  return n.toString().padStart(3, "0")
}

/**
 * Allocates the next serial number for a document, e.g. INV-ACME-001.
 *
 * Must be called inside a prisma.$transaction callback and passed that
 * transaction client (`tx`), so the SELECT ... FOR UPDATE row lock below and
 * the counter increment happen atomically - two concurrent finalize clicks
 * for the same client can never hand out the same number. The
 * @@unique([userId, refNumber]) constraint in the schema is the backstop if
 * that lock is ever bypassed.
 *
 * Only call this at finalize time, never at document creation - see the
 * comment on the Client serial counters in prisma/schema.prisma for why
 * numbers are assigned late (keeps the sequence gapless).
 */
/**
 * Core allocator. Takes the counter column and prefix explicitly so receipts -
 * which are not documents and have no DocumentType - can reuse the same row
 * lock rather than growing a parallel implementation that could drift.
 */
async function allocateSerial(
  tx: Prisma.TransactionClient,
  clientId: string,
  column: (typeof SEQ_COLUMNS)[number],
  prefix: string
): Promise<{ refNumber: string; sequence: number }> {
  if (!SEQ_COLUMNS.includes(column)) {
    throw new Error(`Refusing to allocate a serial from an unknown column: ${column}`)
  }

  const rows = await tx.$queryRawUnsafe<{ code: string; seq: number }[]>(
    `SELECT "code", "${column}" AS seq FROM "Client" WHERE "id" = $1 FOR UPDATE`,
    clientId
  )
  const row = rows[0]
  if (!row) {
    throw new Error(
      "Cannot allocate a serial number without a client - one is required so the number can be scoped to them."
    )
  }

  const nextSeq = row.seq + 1
  await tx.$executeRawUnsafe(`UPDATE "Client" SET "${column}" = $1 WHERE "id" = $2`, nextSeq, clientId)

  return { refNumber: `${prefix}-${row.code}-${pad(nextSeq)}`, sequence: nextSeq }
}

/**
 * Allocates the next receipt number for a client, e.g. RCP-ACME-001.
 *
 * Receipts count on their own series: a payment against any invoice advances
 * the receipt book, not the invoice book.
 */
export async function allocateReceiptRef(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<{ refNumber: string; sequence: number }> {
  return allocateSerial(tx, clientId, "receiptSeq", "RCP")
}

export async function allocateRef(
  tx: Prisma.TransactionClient,
  clientId: string,
  type: DocumentType
): Promise<{ refNumber: string; sequence: number }> {
  const kind = documentKind(type)
  return allocateSerial(tx, clientId, kind.seqColumn, kind.prefix)

}

/**
 * Allocates the next internal Client.clientNumber, locking User.clientSeq
 * the same way allocateRef locks the client row. Called on client create.
 */
export async function allocateClientNumber(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ seq: number }[]>(
    `SELECT "clientSeq" AS seq FROM "User" WHERE "id" = $1 FOR UPDATE`,
    userId
  )
  const row = rows[0]
  if (!row) throw new Error("User not found")

  const next = row.seq + 1
  await tx.$executeRawUnsafe(`UPDATE "User" SET "clientSeq" = $1 WHERE "id" = $2`, next, userId)
  return next
}
