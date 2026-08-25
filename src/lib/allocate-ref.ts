import type { Prisma } from "@prisma/client"

const PREFIX = {
  INVOICE: "INV",
  CONTRACT: "CON",
  QUOTE: "QUO",
} as const

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
 * comment on Client.invoiceSeq/contractSeq in prisma/schema.prisma for why
 * numbers are assigned late (keeps the sequence gapless).
 */
export async function allocateRef(
  tx: Prisma.TransactionClient,
  clientId: string,
  type: keyof typeof PREFIX
): Promise<{ refNumber: string; sequence: number }> {
  const column = type === "CONTRACT" ? "contractSeq" : "invoiceSeq"

  const rows = await tx.$queryRawUnsafe<{ code: string; seq: number }[]>(
    `SELECT "code", "${column}" AS seq FROM "Client" WHERE "id" = $1 FOR UPDATE`,
    clientId
  )
  const row = rows[0]
  if (!row) {
    throw new Error(
      "Cannot finalize a document with no client selected - a client is required so a serial number can be allocated."
    )
  }

  const nextSeq = row.seq + 1
  await tx.$executeRawUnsafe(`UPDATE "Client" SET "${column}" = $1 WHERE "id" = $2`, nextSeq, clientId)

  return { refNumber: `${PREFIX[type]}-${row.code}-${pad(nextSeq)}`, sequence: nextSeq }
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
