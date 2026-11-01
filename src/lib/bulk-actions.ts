import type { DocumentStatus } from "@prisma/client"

/**
 * What a bulk selection is actually allowed to do.
 *
 * These are the same rules the single-row actions already enforce
 * (deleteDraftDocument / voidDocument / archiveClient), lifted somewhere pure
 * so the UI can grey out what it cannot do and the server can re-check every
 * row before touching it. The UI never decides - it only predicts.
 */

export type DocumentRowState = { id: string; status: DocumentStatus }
export type ClientRowState = { id: string; documentCount: number }

/**
 * Only an unissued draft can be deleted. Once a document is numbered it is
 * part of a gapless serial series and a permanent record, so the correction
 * is VOID - which keeps the number allocated.
 */
export function canDeleteDocument(status: DocumentStatus): boolean {
  return status === "DRAFT"
}

/** Voiding cancels an issued document. A draft has nothing to cancel. */
export function canVoidDocument(status: DocumentStatus): boolean {
  return status === "FINALIZED" || status === "SIGNED"
}

/**
 * Document.clientId cascades on delete, so removing a client with documents
 * would silently take their invoices - and the payment ledger under them -
 * with it. A client that has ever been billed is skipped here.
 *
 * This is the rule for the BULK path, where the only thing standing between a
 * mis-ticked checkbox and an invoice ledger is this function. Deleting a
 * billed client is still possible, deliberately and one at a time: see
 * deleteClient() in src/app/dashboard/clients/actions.ts, which is restricted
 * to administrators, counts what will go, and makes them type the client code.
 */
export function canDeleteClient(documentCount: number): boolean {
  return documentCount === 0
}

export function whyDocumentBlocked(status: DocumentStatus, action: "delete" | "void"): string | null {
  if (action === "delete") {
    if (canDeleteDocument(status)) return null
    if (status === "VOID") return "already void"
    return "issued - void it instead of deleting"
  }
  if (canVoidDocument(status)) return null
  if (status === "DRAFT") return "still a draft - delete it instead"
  if (status === "VOID") return "already void"
  return "cannot be voided"
}

export function whyClientBlocked(documentCount: number): string | null {
  if (canDeleteClient(documentCount)) return null
  return `has ${documentCount} document${documentCount === 1 ? "" : "s"} - archive instead`
}

export type Partitioned<T> = { eligible: T[]; blocked: T[] }

/** Splits a selection into what the action can and cannot touch. */
export function partitionDocuments(
  rows: DocumentRowState[],
  action: "delete" | "void"
): Partitioned<DocumentRowState> {
  const allowed = action === "delete" ? canDeleteDocument : canVoidDocument
  return {
    eligible: rows.filter((r) => allowed(r.status)),
    blocked: rows.filter((r) => !allowed(r.status)),
  }
}

export function partitionClients(rows: ClientRowState[]): Partitioned<ClientRowState> {
  return {
    eligible: rows.filter((r) => canDeleteClient(r.documentCount)),
    blocked: rows.filter((r) => !canDeleteClient(r.documentCount)),
  }
}

export type DealRowState = { id: string; won: boolean }

/**
 * A won lead is kept out of a bulk delete.
 *
 * Bulk delete exists to clear junk - spam form fills, duplicates, test rows -
 * and a won lead is never junk: it is the sales history the revenue reports
 * count, and often the record a client or a project was started from. One
 * mis-ticked select-all should not be able to rewrite last quarter's numbers.
 * Moving a won lead back out of Won first makes it deletable, which keeps the
 * door open while making it a decision rather than a side effect.
 */
export function canDeleteDeal(won: boolean): boolean {
  return !won
}

export function whyDealBlocked(won: boolean): string | null {
  return canDeleteDeal(won) ? null : "won - part of your sales history"
}

export function partitionDeals(rows: DealRowState[]): Partitioned<DealRowState> {
  return {
    eligible: rows.filter((r) => canDeleteDeal(r.won)),
    blocked: rows.filter((r) => !canDeleteDeal(r.won)),
  }
}
