"use server"

import prisma from "@/lib/db"
import type { Prisma } from "@prisma/client"
import { getViewerFingerprint } from "@/lib/request-info"
import { revalidatePath } from "next/cache"
import type { SignaturePayload } from "@/lib/types"
import {
  publicSlugSchema,
  signContractSchema,
  type SignContractInput,
} from "@/lib/share-validation"

// ---------------------------------------------------------------------------
// Everything in this file is reachable by anonymous visitors - server actions
// are public HTTP endpoints, and these are deliberately not behind
// getCurrentUser(). The publicSlug IS the capability, so it is the only thing
// a caller may use to name a document: accepting an internal id here would
// let anyone act on any document by guessing cuids.
//
// TypeScript types are erased at runtime, so every input is parsed with zod
// before it reaches the database.
// ---------------------------------------------------------------------------

export type { SignContractInput } from "@/lib/share-validation"

/** One activity row per viewer per hour, matching the "viewed" dedupe. */
const LOG_DEDUPE_WINDOW_MS = 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Download logging
// ---------------------------------------------------------------------------
export async function logDownload(publicSlug: string) {
  const parsed = publicSlugSchema.safeParse(publicSlug)
  // Silently ignore: this is telemetry on a public page, so a bad slug should
  // never surface an error to a visitor reading a document.
  if (!parsed.success) return

  const document = await prisma.document.findUnique({
    where: { publicSlug: parsed.data },
    select: { id: true, status: true },
  })
  if (!document || document.status === "DRAFT") return

  // Bound the write: without this, anyone holding a share link can append
  // activity rows in a loop.
  const { hash, userAgent } = await getViewerFingerprint()
  const recent = await prisma.documentActivity.findFirst({
    where: {
      documentId: document.id,
      event: "downloaded",
      createdAt: { gte: new Date(Date.now() - LOG_DEDUPE_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { meta: true },
  })
  if ((recent?.meta as { viewerHash?: string } | null)?.viewerHash === hash) return

  await prisma.documentActivity.create({
    data: { documentId: document.id, event: "downloaded", meta: { viewerHash: hash, userAgent } },
  })
}

// ---------------------------------------------------------------------------
// E-signature - public flow. Only a FINALIZED contract can be signed, once.
// ---------------------------------------------------------------------------
export async function signContract(publicSlug: string, input: SignContractInput) {
  const slug = publicSlugSchema.safeParse(publicSlug)
  if (!slug.success) throw new Error("This link is no longer valid.")

  const parsed = signContractSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "That signature could not be accepted.")
  }
  const signatureInput = parsed.data

  const document = await prisma.document.findUnique({ where: { publicSlug: slug.data } })
  if (!document) throw new Error("This link is no longer valid.")
  if (document.type !== "CONTRACT") throw new Error("Only contracts can be signed.")
  // Friendly early exits. The authoritative guard is the conditional update
  // below - these can go stale between here and the write.
  if (document.status === "SIGNED") throw new Error("This contract has already been signed.")
  if (document.status !== "FINALIZED") throw new Error("This contract is not ready to be signed.")

  const { hash, userAgent } = await getViewerFingerprint()

  // contentHash was set at finalize time (src/app/dashboard/documents/[id]/actions.ts)
  // and content is immutable from that point on, so re-reading it here and
  // recording it against the signature is what makes the signature mean
  // "I agreed to exactly this text" - not just "I clicked a button".
  const signature: SignaturePayload = {
    method: signatureInput.method,
    typedName: signatureInput.method === "typed" ? signatureInput.typedName : undefined,
    drawnDataUrl: signatureInput.method === "drawn" ? signatureInput.drawnDataUrl : undefined,
    signedAt: new Date().toISOString(),
    ipHash: hash,
    userAgent,
    contentHashAtSigning: document.contentHash || "",
  }

  await prisma.$transaction(async (tx) => {
    // Compare-and-swap. The status guard lives inside the UPDATE, so two
    // concurrent signings cannot both pass a separate check and have the
    // second silently overwrite the first signature and its timestamp.
    const { count } = await tx.document.updateMany({
      where: { id: document.id, status: "FINALIZED" },
      data: { status: "SIGNED", signatureData: signature as unknown as Prisma.InputJsonValue },
    })
    if (count === 0) throw new Error("This contract has already been signed.")

    await tx.documentActivity.create({
      data: { documentId: document.id, event: "signed", meta: { method: signatureInput.method } },
    })
  })

  revalidatePath(`/share/${slug.data}`)
  revalidatePath(`/dashboard/documents/${document.id}`)
}
