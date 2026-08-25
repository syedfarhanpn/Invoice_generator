"use server"

import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { normalizeClientCode, suggestClientCode } from "@/lib/client-code"
import { allocateClientNumber } from "@/lib/allocate-ref"
import { revalidatePath } from "next/cache"

// Note: these actions return { id } instead of calling redirect() themselves.
// They're invoked directly from a client component (src/app/dashboard/clients/client-form.tsx)
// wrapped in try/catch for error display - redirect() throws a special
// NEXT_REDIRECT signal that a surrounding catch would swallow and misreport
// as a failure, so navigation happens client-side via router.push instead.

export type ClientFormInput = {
  fullName: string
  businessName?: string
  email: string
  phone?: string
  address?: string
  country?: string
  taxId?: string
  notes?: string
  tags?: string[]
  defaultCurrency?: string
  code?: string // manual override; auto-suggested if omitted
}

async function codeIsTaken(userId: string, code: string, excludeClientId?: string) {
  const existing = await prisma.client.findFirst({
    where: { userId, code, ...(excludeClientId ? { id: { not: excludeClientId } } : {}) },
    select: { id: true },
  })
  return !!existing
}

export async function suggestCodeForName(name: string): Promise<string> {
  const user = await getCurrentUser()
  return suggestClientCode(name || "Client", (code) => codeIsTaken(user.id, code))
}

export async function createClient(input: ClientFormInput) {
  const user = await getCurrentUser()

  if (!input.fullName?.trim()) throw new Error("Full name is required")
  if (!input.email?.trim()) throw new Error("Email is required")

  const nameForCode = input.businessName?.trim() || input.fullName.trim()
  let code = input.code ? normalizeClientCode(input.code) : ""
  if (!code) {
    code = await suggestClientCode(nameForCode, (c) => codeIsTaken(user.id, c))
  } else if (await codeIsTaken(user.id, code)) {
    throw new Error(`Client code "${code}" is already in use.`)
  }

  const client = await prisma.$transaction(async (tx) => {
    const clientNumber = await allocateClientNumber(tx, user.id)
    return tx.client.create({
      data: {
        userId: user.id,
        clientNumber,
        code,
        fullName: input.fullName.trim(),
        businessName: input.businessName?.trim() || null,
        email: input.email.trim(),
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        country: input.country?.trim() || null,
        taxId: input.taxId?.trim() || null,
        notes: input.notes?.trim() || null,
        tags: input.tags ?? [],
        defaultCurrency: input.defaultCurrency || null,
      },
    })
  })

  revalidatePath("/dashboard/clients")
  return { id: client.id }
}

export async function updateClient(id: string, input: ClientFormInput) {
  const user = await getCurrentUser()

  const existing = await prisma.client.findUnique({
    where: { id, userId: user.id },
    include: { _count: { select: { documents: true } } },
  })
  if (!existing) throw new Error("Client not found")

  const hasDocuments = existing._count.documents > 0
  let code = existing.code

  if (input.code) {
    const normalized = normalizeClientCode(input.code)
    if (normalized !== existing.code) {
      if (hasDocuments) {
        throw new Error(
          "This client's code is locked because they already have a document - editing it would orphan already-issued serial numbers."
        )
      }
      if (await codeIsTaken(user.id, normalized, id)) {
        throw new Error(`Client code "${normalized}" is already in use.`)
      }
      code = normalized
    }
  }

  await prisma.client.update({
    where: { id },
    data: {
      code,
      fullName: input.fullName.trim(),
      businessName: input.businessName?.trim() || null,
      email: input.email.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      country: input.country?.trim() || null,
      taxId: input.taxId?.trim() || null,
      notes: input.notes?.trim() || null,
      tags: input.tags ?? [],
      defaultCurrency: input.defaultCurrency || null,
    },
  })

  revalidatePath("/dashboard/clients")
  revalidatePath(`/dashboard/clients/${id}`)
  return { id }
}

export async function archiveClient(id: string, archived: boolean) {
  const user = await getCurrentUser()
  await prisma.client.update({
    where: { id, userId: user.id },
    data: { archivedAt: archived ? new Date() : null },
  })
  revalidatePath("/dashboard/clients")
  revalidatePath(`/dashboard/clients/${id}`)
}
