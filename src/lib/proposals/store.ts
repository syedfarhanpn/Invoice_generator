import type { Prisma } from "@prisma/client"

import prisma from "@/lib/db"

/**
 * Whether the Proposal table exists yet.
 *
 * The app ships before its migration is applied, and a query against a
 * missing table is a 500. Every proposal page and action asks this first and
 * says what to do instead. Once the table is there it stays there, so a yes
 * is remembered for the life of the server.
 */
let ready = false

export async function proposalsReady(): Promise<boolean> {
  if (ready) return true
  const rows = await prisma.$queryRaw<{ table: string | null }[]>`
    SELECT to_regclass('public."Proposal"')::text AS "table"
  `
  ready = rows[0]?.table != null
  return ready
}

export const PROPOSALS_SETUP_MESSAGE =
  "Proposals need a one-time database update. Run `npm run db:migrate`, then reload this page."

/**
 * The next proposal number for a client, under a row lock on the client.
 *
 * Must run inside the transaction that creates the proposal, the same way
 * allocateRef() does for invoices: two proposals written for one client at
 * the same moment queue on the lock instead of both taking 002. The unique
 * (clientId, sequence) index is the backstop.
 */
export async function nextProposalNumber(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<{ code: string; sequence: number }> {
  const rows = await tx.$queryRaw<{ code: string }[]>`
    SELECT "code" FROM "Client" WHERE "id" = ${clientId} FOR UPDATE
  `
  const client = rows[0]
  if (!client) throw new Error("That client no longer exists.")

  const latest = await tx.proposal.aggregate({
    where: { clientId },
    _max: { sequence: true },
  })
  return { code: client.code, sequence: (latest._max.sequence ?? 0) + 1 }
}
