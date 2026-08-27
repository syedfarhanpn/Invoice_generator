import type { Prisma } from "@prisma/client"

import prisma from "@/lib/db"
import { computeTotals } from "@/lib/money"
import type { InvoiceContent } from "@/lib/types"
import { authenticateApiRequest } from "@/lib/api/auth"
import { withIdempotency } from "@/lib/api/idempotency"
import { apiError, apiOk, readJsonBody } from "@/lib/api/http"
import { documentCreateSchema, listQuerySchema, zodDetails } from "@/lib/api/schemas"
import { serializeDocument } from "@/lib/api/serialize"

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const query = listQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  })
  if (!query.success) {
    return apiError("invalid_request", "Invalid query parameters.", zodDetails(query.error))
  }
  const { limit, cursor } = query.data

  const type = url.searchParams.get("type")
  const status = url.searchParams.get("status")

  const documents = await prisma.document.findMany({
    where: {
      userId: auth.user.id,
      ...(type ? { type: type as Prisma.EnumDocumentTypeFilter["equals"] } : {}),
      ...(status ? { status: status as Prisma.EnumDocumentStatusFilter["equals"] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { client: true },
  })

  const hasMore = documents.length > limit
  const page = hasMore ? documents.slice(0, limit) : documents

  return apiOk({
    object: "list",
    data: page.map(serializeDocument),
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  })
}

/**
 * Creates a DRAFT document.
 *
 * Deliberately never finalizes: finalizing allocates a permanent serial
 * number and freezes the content, and that should be an explicit human act in
 * the dashboard rather than a side effect of a CRM sync. A retried push that
 * auto-finalized would burn invoice numbers.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const body = await readJsonBody(request)
  if (!body.ok) return body.response

  const parsed = documentCreateSchema.safeParse(body.data)
  if (!parsed.success) {
    return apiError("invalid_request", "The request body failed validation.", zodDetails(parsed.error))
  }
  const input = parsed.data

  const idem = await withIdempotency(request, auth.user.id, "POST /v1/documents", body.data)
  if ("error" in idem) return idem.error
  if (idem.replay) return idem.response

  if (input.externalId) {
    const existing = await prisma.document.findUnique({
      where: { userId_externalId: { userId: auth.user.id, externalId: input.externalId } },
      include: { client: true },
    })
    if (existing) {
      // Documents are not upserted. A finalized one is immutable by design,
      // and silently rewriting a draft the user may have edited would be worse
      // than telling the caller it already exists.
      return apiError(
        "conflict",
        `A document already exists for externalId "${input.externalId}".`,
        { documentId: existing.id, status: existing.status }
      )
    }
  }

  // Resolve the client by either identifier, always scoped to this tenant.
  let clientId: string | null = null
  if (input.clientId || input.clientExternalId) {
    const client = input.clientExternalId
      ? await prisma.client.findUnique({
          where: { userId_externalId: { userId: auth.user.id, externalId: input.clientExternalId } },
          select: { id: true, defaultCurrency: true },
        })
      : await prisma.client.findFirst({
          where: { id: input.clientId!, userId: auth.user.id },
          select: { id: true, defaultCurrency: true },
        })
    if (!client) return apiError("not_found", "No such client.")
    clientId = client.id
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: auth.user.id },
    select: { currency: true, defaultTaxMode: true, defaultTaxRate: true, defaultTaxLabel: true },
  })

  const currency = input.currency || profile?.currency || "USD"
  const taxMode = input.taxMode ?? profile?.defaultTaxMode ?? "NONE"
  const taxRate =
    taxMode === "PERCENTAGE" ? input.taxRate ?? Number(profile?.defaultTaxRate ?? 0) : null
  const taxLabel = taxMode === "PERCENTAGE" ? input.taxLabel ?? profile?.defaultTaxLabel ?? "Tax" : null

  // Same helper the editor and previews use, so an API-created draft totals
  // identically to one typed in by hand.
  const totals = computeTotals(input.lineItems, currency, taxMode, taxRate)

  const content: InvoiceContent = {
    lineItems: input.lineItems,
    notes: input.notes ?? "",
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          userId: auth.user.id,
          clientId,
          type: input.type,
          status: "DRAFT",
          title: input.title ?? null,
          currency,
          taxMode,
          taxRate,
          taxLabel,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          totalAmount: totals.total,
          issueDate: input.issueDate ?? null,
          dueDate: input.dueDate ?? null,
          content: content as unknown as Prisma.InputJsonValue,
          externalId: input.externalId ?? null,
          sourceSystem: input.sourceSystem ?? null,
        },
        include: { client: true },
      })
      // Scoped by construction: doc was created with this tenant userId a
      // few lines above, inside the same transaction.
      await tx.documentActivity.create({
        data: {
          documentId: doc.id,
          event: "created",
          meta: { via: "api", sourceSystem: input.sourceSystem ?? null },
        },
      })
      return doc
    })

    const payload = serializeDocument(created)
    await idem.commit(201, payload)
    return apiOk(payload, 201)
  } catch (err) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return apiError("conflict", "A document with that externalId already exists.")
    }
    throw err
  }
}
