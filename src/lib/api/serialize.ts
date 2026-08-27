import type { Client, Document } from "@prisma/client"

import type { InvoiceContent } from "@/lib/types"
import { documentKind } from "@/lib/document-kinds"

/**
 * Wire representations. Prisma hands back Decimal objects and Date instances;
 * an API consumer wants numbers and ISO strings.
 *
 * These are an explicit allowlist rather than a spread of the row, so adding
 * an internal column can never accidentally start leaking over the API.
 */

const num = (v: unknown): number | null => (v == null ? null : Number(v))
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

export function serializeClient(client: Client & { _count?: { documents: number } }) {
  return {
    id: client.id,
    object: "client" as const,
    code: client.code,
    clientNumber: client.clientNumber,
    fullName: client.fullName,
    businessName: client.businessName,
    email: client.email,
    phone: client.phone,
    address: client.address,
    country: client.country,
    taxId: client.taxId,
    notes: client.notes,
    tags: client.tags,
    defaultCurrency: client.defaultCurrency,
    archivedAt: iso(client.archivedAt),
    externalId: client.externalId,
    sourceSystem: client.sourceSystem,
    documentCount: client._count?.documents,
    createdAt: iso(client.createdAt),
    updatedAt: iso(client.updatedAt),
  }
}

export function serializeDocument(document: Document & { client?: Client | null }) {
  const content = (document.content as unknown as InvoiceContent) || {}
  const kind = documentKind(document.type)

  return {
    id: document.id,
    object: "document" as const,
    type: document.type,
    typeLabel: kind.label,
    status: document.status,
    refNumber: document.refNumber,
    title: document.title,
    clientId: document.clientId,
    clientExternalId: document.client?.externalId ?? null,
    currency: document.currency,
    taxMode: document.taxMode,
    taxRate: num(document.taxRate),
    taxLabel: document.taxLabel,
    subtotal: num(document.subtotal),
    taxAmount: num(document.taxAmount),
    totalAmount: num(document.totalAmount),
    amountPaid: num(document.amountPaid),
    issueDate: iso(document.issueDate),
    dueDate: iso(document.dueDate),
    finalizedAt: iso(document.finalizedAt),
    lineItems: (content.lineItems || []).map((li) => ({
      description: li.description,
      qty: Number(li.qty) || 0,
      rate: Number(li.rate) || 0,
    })),
    notes: content.notes ?? null,
    // Only present once finalized; a draft has no share link by design.
    publicSlug: document.publicSlug,
    externalId: document.externalId,
    sourceSystem: document.sourceSystem,
    convertedFromId: document.convertedFromId,
    createdAt: iso(document.createdAt),
    updatedAt: iso(document.updatedAt),
  }
}
