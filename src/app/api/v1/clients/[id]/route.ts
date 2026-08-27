import prisma from "@/lib/db"
import { authenticateApiRequest } from "@/lib/api/auth"
import { apiError, apiOk, readJsonBody } from "@/lib/api/http"
import { clientUpdateSchema, zodDetails } from "@/lib/api/schemas"
import { serializeClient } from "@/lib/api/serialize"

/**
 * `id` accepts either the internal id or `ext:<externalId>`, so a CRM can
 * address a record by its own identifier without storing ours.
 */
async function findOwnedClient(userId: string, idOrExternal: string) {
  if (idOrExternal.startsWith("ext:")) {
    const externalId = idOrExternal.slice(4)
    if (!externalId) return null
    return prisma.client.findUnique({
      where: { userId_externalId: { userId, externalId } },
      include: { _count: { select: { documents: true } } },
    })
  }
  // findFirst with userId in the WHERE, never findUnique on id alone - the
  // tenant scope has to be part of the lookup, not a check afterwards.
  return prisma.client.findFirst({
    where: { id: idOrExternal, userId },
    include: { _count: { select: { documents: true } } },
  })
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const client = await findOwnedClient(auth.user.id, id)
  if (!client) return apiError("not_found", "No such client.")

  return apiOk(serializeClient(client))
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const body = await readJsonBody(request)
  if (!body.ok) return body.response

  const parsed = clientUpdateSchema.safeParse(body.data)
  if (!parsed.success) {
    return apiError("invalid_request", "The request body failed validation.", zodDetails(parsed.error))
  }
  const input = parsed.data

  const client = await findOwnedClient(auth.user.id, id)
  if (!client) return apiError("not_found", "No such client.")

  // The serial code is part of every document number already issued for this
  // client, so it is immutable once any document exists.
  if (input.code !== undefined && client._count.documents > 0) {
    return apiError(
      "conflict",
      "This client's code cannot be changed because documents have already been issued under it."
    )
  }

  const updated = await prisma.client.update({
    // userId is repeated here on purpose: the scope is part of the write, not
    // just inherited from the scoped read above.
    where: { id: client.id, userId: auth.user.id },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.businessName !== undefined ? { businessName: input.businessName ?? null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
      ...(input.address !== undefined ? { address: input.address ?? null } : {}),
      ...(input.country !== undefined ? { country: input.country ?? null } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId ?? null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      ...(input.tags !== undefined ? { tags: input.tags ?? [] } : {}),
      ...(input.defaultCurrency !== undefined ? { defaultCurrency: input.defaultCurrency ?? null } : {}),
      ...(input.externalId !== undefined ? { externalId: input.externalId ?? null } : {}),
      ...(input.sourceSystem !== undefined ? { sourceSystem: input.sourceSystem ?? null } : {}),
    },
    include: { _count: { select: { documents: true } } },
  })

  return apiOk(serializeClient(updated))
}
