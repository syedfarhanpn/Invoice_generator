import prisma from "@/lib/db"
import { authenticateApiRequest } from "@/lib/api/auth"
import { apiError, apiOk } from "@/lib/api/http"
import { serializeDocument } from "@/lib/api/serialize"

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  // Tenant scope is part of the lookup, never a check afterwards.
  const document = id.startsWith("ext:")
    ? await prisma.document.findUnique({
        where: { userId_externalId: { userId: auth.user.id, externalId: id.slice(4) } },
        include: { client: true },
      })
    : await prisma.document.findFirst({
        where: { id, userId: auth.user.id },
        include: { client: true },
      })

  if (!document) return apiError("not_found", "No such document.")
  return apiOk(serializeDocument(document))
}
