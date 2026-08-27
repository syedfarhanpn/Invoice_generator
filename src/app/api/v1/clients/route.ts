import prisma from "@/lib/db"
import { allocateClientNumber } from "@/lib/allocate-ref"
import { normalizeClientCode, suggestClientCode } from "@/lib/client-code"
import { authenticateApiRequest } from "@/lib/api/auth"
import { withIdempotency } from "@/lib/api/idempotency"
import { apiError, apiOk, readJsonBody } from "@/lib/api/http"
import { clientCreateSchema, listQuerySchema, zodDetails } from "@/lib/api/schemas"
import { serializeClient } from "@/lib/api/serialize"

// Every query below is scoped by the authenticated tenant's user.id. That
// scoping is the isolation boundary for the whole API - there is no code path
// here that reads a row without it.

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

  const externalId = url.searchParams.get("externalId")
  const { limit, cursor } = query.data

  const clients = await prisma.client.findMany({
    where: { userId: auth.user.id, ...(externalId ? { externalId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // one extra row tells us whether another page exists
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { _count: { select: { documents: true } } },
  })

  const hasMore = clients.length > limit
  const page = hasMore ? clients.slice(0, limit) : clients

  return apiOk({
    object: "list",
    data: page.map(serializeClient),
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  })
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const body = await readJsonBody(request)
  if (!body.ok) return body.response

  const parsed = clientCreateSchema.safeParse(body.data)
  if (!parsed.success) {
    return apiError("invalid_request", "The request body failed validation.", zodDetails(parsed.error))
  }
  const input = parsed.data

  const idem = await withIdempotency(request, auth.user.id, "POST /v1/clients", body.data)
  if ("error" in idem) return idem.error
  if (idem.replay) return idem.response

  // An externalId makes this an upsert: a CRM re-pushing the same record
  // updates it instead of creating a duplicate.
  if (input.externalId) {
    const existing = await prisma.client.findUnique({
      where: { userId_externalId: { userId: auth.user.id, externalId: input.externalId } },
    })
    if (existing) {
      const updated = await prisma.client.update({
        where: { id: existing.id },
        data: {
          fullName: input.fullName,
          email: input.email,
          businessName: input.businessName ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          country: input.country ?? null,
          taxId: input.taxId ?? null,
          notes: input.notes ?? null,
          ...(input.tags ? { tags: input.tags } : {}),
          defaultCurrency: input.defaultCurrency ?? null,
          sourceSystem: input.sourceSystem ?? existing.sourceSystem,
          // code is deliberately NOT updated: it is baked into every serial
          // number already issued for this client.
        },
      })
      const payload = serializeClient(updated)
      await idem.commit(200, payload)
      return apiOk(payload, 200)
    }
  }

  const codeIsTaken = async (code: string) =>
    !!(await prisma.client.findFirst({
      where: { userId: auth.user.id, code },
      select: { id: true },
    }))

  let code = input.code ? normalizeClientCode(input.code) : ""
  if (!code) {
    code = await suggestClientCode(input.businessName || input.fullName, codeIsTaken)
  } else if (await codeIsTaken(code)) {
    return apiError("conflict", `Client code "${code}" is already in use.`)
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const clientNumber = await allocateClientNumber(tx, auth.user.id)
      return tx.client.create({
        data: {
          userId: auth.user.id,
          clientNumber,
          code,
          fullName: input.fullName,
          email: input.email,
          businessName: input.businessName ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          country: input.country ?? null,
          taxId: input.taxId ?? null,
          notes: input.notes ?? null,
          tags: input.tags ?? [],
          defaultCurrency: input.defaultCurrency ?? null,
          externalId: input.externalId ?? null,
          sourceSystem: input.sourceSystem ?? null,
        },
      })
    })

    const payload = serializeClient(created)
    await idem.commit(201, payload)
    return apiOk(payload, 201)
  } catch (err) {
    // Unique violation: two concurrent pushes of the same externalId or code.
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return apiError("conflict", "A client with that code or externalId already exists.")
    }
    throw err
  }
}
