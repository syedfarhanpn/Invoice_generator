"use server"

import prisma from "@/lib/db"
import type { Prisma } from "@prisma/client"
import { getViewerFingerprint } from "@/lib/request-info"
import { revalidatePath } from "next/cache"
import type { SignaturePayload } from "@/lib/types"

// Deliberately does NOT use getCurrentUser() - this is called from the
// public share page by anonymous visitors, not the admin.
export async function logDownload(documentId: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { status: true } })
  if (!doc || doc.status === "DRAFT") return
  await prisma.documentActivity.create({ data: { documentId, event: "downloaded" } })
}

// ---------------------------------------------------------------------------
// E-signature - public flow (no admin auth; the publicSlug itself is the
// capability). Deliberately strict about state: only a FINALIZED contract
// can be signed, and only once.
// ---------------------------------------------------------------------------
export type SignContractInput = {
  method: "typed" | "drawn"
  typedName?: string
  drawnDataUrl?: string
}

export async function signContract(publicSlug: string, input: SignContractInput) {
  const document = await prisma.document.findUnique({ where: { publicSlug } })
  if (!document) throw new Error("This link is no longer valid.")
  if (document.type !== "CONTRACT") throw new Error("Only contracts can be signed.")
  if (document.status === "SIGNED") throw new Error("This contract has already been signed.")
  if (document.status !== "FINALIZED") throw new Error("This contract is not ready to be signed.")

  if (input.method === "typed" && !input.typedName?.trim()) {
    throw new Error("Type your full name to sign.")
  }
  if (input.method === "drawn" && !input.drawnDataUrl) {
    throw new Error("Draw your signature to sign.")
  }

  const { hash, userAgent } = await getViewerFingerprint()

  // contentHash was set at finalize time (src/app/dashboard/documents/[id]/actions.ts)
  // and content is immutable from that point on, so re-reading it here and
  // recording it against the signature is what makes the signature mean
  // "I agreed to exactly this text" - not just "I clicked a button".
  const signature: SignaturePayload = {
    method: input.method,
    typedName: input.typedName?.trim(),
    drawnDataUrl: input.drawnDataUrl,
    signedAt: new Date().toISOString(),
    ipHash: hash,
    userAgent,
    contentHashAtSigning: document.contentHash || "",
  }

  await prisma.$transaction([
    prisma.document.update({
      where: { id: document.id },
      data: { status: "SIGNED", signatureData: signature as unknown as Prisma.InputJsonValue },
    }),
    prisma.documentActivity.create({
      data: { documentId: document.id, event: "signed", meta: { method: input.method } },
    }),
  ])

  revalidatePath(`/share/${publicSlug}`)
  revalidatePath(`/dashboard/documents/${document.id}`)
}
