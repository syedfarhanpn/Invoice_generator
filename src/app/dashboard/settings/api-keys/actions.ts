"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"

import prisma from "@/lib/db"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import { assertPermission } from "@/lib/access"
import { generateApiKey } from "@/lib/api-key"

const nameSchema = z.string().trim().min(1, "Give the key a name.").max(60)

/**
 * Returns the plaintext secret ONCE. It is never stored and cannot be
 * recovered - only its SHA-256 is kept.
 */
export async function createApiKey(rawName: string): Promise<{ id: string; plaintext: string }> {
  await assertPermission("settings", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const name = nameSchema.parse(rawName)

  const active = await prisma.apiKey.count({ where: { userId: workspaceId, revokedAt: null } })
  if (active >= 10) {
    throw new Error("You already have 10 active keys. Revoke one before creating another.")
  }

  const { plaintext, lookupId, keyHash } = generateApiKey()
  const created = await prisma.apiKey.create({
    data: { userId: workspaceId, name, lookupId, keyHash },
    select: { id: true },
  })

  revalidatePath("/dashboard/settings/api-keys")
  return { id: created.id, plaintext }
}

export async function revokeApiKey(id: string) {
  await assertPermission("settings", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  // Scoped update: a key belonging to another tenant simply matches nothing.
  const { count } = await prisma.apiKey.updateMany({
    where: { id, userId: workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (count === 0) throw new Error("That key does not exist or is already revoked.")

  revalidatePath("/dashboard/settings/api-keys")
}
