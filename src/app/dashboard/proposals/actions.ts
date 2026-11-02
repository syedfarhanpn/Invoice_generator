"use server"

import { Prisma, ProposalStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { hasPermission } from "@/lib/access"
import { allocateClientNumber } from "@/lib/allocate-ref"
import { normalizeClientCode, suggestClientCode } from "@/lib/client-code"
import prisma from "@/lib/db"
import { parseStoredDraft, type ProposalDraft } from "@/lib/proposals/draft"
import {
  firstIssue,
  proposalBriefSchema,
  type NewProposalClient,
  proposalClientChoiceSchema,
  type ProposalBrief,
} from "@/lib/proposals/input"
import { briefMessage, revisionMessage, type BriefParty } from "@/lib/proposals/prompt"
import { nextProposalNumber, proposalsReady, PROPOSALS_SETUP_MESSAGE } from "@/lib/proposals/store"
import { addDays, cleanDraft, proposalDay, proposalRef } from "@/lib/proposals/view"
import { ProposalWriterError, writeProposal } from "@/lib/proposals/writer"
import { claudeKey } from "@/lib/integrations/store"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

/**
 * Proposal actions.
 *
 * They return a result rather than throwing, because most of what can go
 * wrong here is worth reading - no API key yet, Claude busy, a client code
 * already taken - and Next.js replaces a thrown error's message with a
 * generic one in production.
 *
 * Claude is called BEFORE anything is written. A failed or slow generation
 * leaves no half-made client or numberless proposal behind; the client, the
 * number and the proposal are then created together in one transaction.
 */

export type ProposalResult = { ok: true; id: string } | { ok: false; error: string }

const DENIED = "You do not have permission to do that."
const CLAUDE_NOT_CONNECTED =
  "Claude is not connected for your company yet. An owner or admin can add your Anthropic API key in Settings - Integrations."
const UNEXPECTED = "Something went wrong while saving the proposal. Try again."

async function canWrite(): Promise<boolean> {
  return hasPermission("documents", "write")
}

function asJson(value: unknown): Prisma.InputJsonValue {
  // Drops `undefined` fields, which Prisma's JSON input does not accept.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function codeIsTaken(workspaceId: string, code: string): Promise<boolean> {
  const existing = await prisma.client.findFirst({
    where: { userId: workspaceId, code },
    select: { id: true },
  })
  return existing != null
}

async function studioName(workspaceId: string): Promise<string> {
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: workspaceId },
    select: { businessName: true },
  })
  return profile?.businessName ?? ""
}

/**
 * Writes with the company's OWN Anthropic key. There is no fallback to
 * anyone else's: a company that has not connected Claude is told how to,
 * rather than having its proposals billed to another account.
 */
async function draftWith(message: string): Promise<{ draft: ProposalDraft; model: string } | { error: string }> {
  const { orgId } = await getWorkspaceIdentity()
  const apiKey = await claudeKey(orgId)
  if (!apiKey) return { error: CLAUDE_NOT_CONNECTED }

  try {
    return await writeProposal(message, apiKey)
  } catch (error) {
    if (error instanceof ProposalWriterError) return { error: error.message }
    console.error("[proposals] generation failed", error)
    return { error: "Claude could not write the proposal just now. Try again." }
  }
}

function revalidateProposals(id?: string, clientId?: string) {
  revalidatePath("/dashboard/proposals")
  if (id) revalidatePath(`/dashboard/proposals/${id}`)
  if (clientId) revalidatePath(`/dashboard/clients/${clientId}`)
}

// ---------------------------------------------------------------------------
// Client code
// ---------------------------------------------------------------------------

export type CodeCheck = { code: string; available: boolean }

/**
 * The code a new client would get, and whether a typed one is free. Used by
 * the form as the operator types, so a clash shows before Claude is asked to
 * write anything.
 */
export async function checkProposalClientCode(input: { name: string; code?: string }): Promise<CodeCheck | null> {
  if (!(await canWrite()) || !(await hasPermission("clients", "write"))) return null
  const { workspaceId } = await getWorkspaceIdentity()

  const typed = input.code ? normalizeClientCode(input.code) : ""
  if (typed) return { code: typed, available: !(await codeIsTaken(workspaceId, typed)) }

  const code = await suggestClientCode(input.name.trim() || "Client", (c) => codeIsTaken(workspaceId, c))
  return { code, available: true }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const createSchema = z.object({
  client: proposalClientChoiceSchema,
  brief: proposalBriefSchema,
})

export async function createProposal(raw: unknown): Promise<ProposalResult> {
  if (!(await canWrite())) return { ok: false, error: DENIED }

  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { client: choice, brief } = parsed.data

  if (choice.mode === "new" && !(await hasPermission("clients", "write"))) {
    return { ok: false, error: "You can write proposals for existing clients, but not add new ones." }
  }
  if (!(await proposalsReady())) return { ok: false, error: PROPOSALS_SETUP_MESSAGE }

  const { workspaceId, actorId, orgId } = await getWorkspaceIdentity()

  // Who it is for, settled before Claude is called.
  let party: BriefParty
  let existingClientId: string | null = null
  let newClient: (NewProposalClient & { code: string }) | null = null

  if (choice.mode === "existing") {
    const existing = await prisma.client.findFirst({
      where: { id: choice.clientId, userId: workspaceId, archivedAt: null },
      select: { id: true, fullName: true, businessName: true, address: true, country: true },
    })
    if (!existing) return { ok: false, error: "That client no longer exists." }
    existingClientId = existing.id
    party = existing
  } else {
    const c = choice.client
    let code = c.code ? normalizeClientCode(c.code) : ""
    if (!code) {
      code = await suggestClientCode(c.businessName || c.fullName, (x) => codeIsTaken(workspaceId, x))
    } else if (await codeIsTaken(workspaceId, code)) {
      return { ok: false, error: `Client code "${code}" is already used by another client. Pick another.` }
    }
    newClient = { ...c, code }
    party = {
      fullName: c.fullName,
      businessName: c.businessName ?? null,
      address: c.address ?? null,
      country: c.country ?? null,
    }
  }

  const written = await draftWith(
    briefMessage({ brief, client: party, studioName: await studioName(workspaceId) })
  )
  if ("error" in written) return { ok: false, error: written.error }

  const draft = cleanDraft(written.draft, brief)
  const issueDate = proposalDay()

  try {
    const saved = await prisma.$transaction(
      async (tx) => {
        let clientId = existingClientId
        if (newClient) {
          const clientNumber = await allocateClientNumber(tx, workspaceId)
          const created = await tx.client.create({
            data: {
              userId: workspaceId,
              orgId,
              clientNumber,
              code: newClient.code,
              fullName: newClient.fullName,
              businessName: newClient.businessName ?? null,
              // Not required for a proposal - see newProposalClientSchema.
              email: newClient.email ?? "",
              phone: newClient.phone,
              address: newClient.address ?? null,
              country: newClient.country ?? null,
              tags: [],
              defaultCurrency: brief.currency,
            },
            select: { id: true },
          })
          clientId = created.id
        }

        const { code, sequence } = await nextProposalNumber(tx, clientId!)
        return tx.proposal.create({
          data: {
            userId: workspaceId,
            orgId,
            clientId: clientId!,
            createdById: actorId,
            sequence,
            refNumber: proposalRef(code, sequence),
            title: draft.projectName,
            currency: brief.currency,
            totalAmount: brief.value,
            input: asJson(brief),
            content: asJson(draft),
            model: written.model,
            issueDate,
            validUntil: addDays(issueDate, brief.validityDays),
          },
          select: { id: true, clientId: true },
        })
      },
      { timeout: 20_000 }
    )

    revalidateProposals(saved.id, saved.clientId)
    if (newClient) revalidatePath("/dashboard/clients")
    return { ok: true, id: saved.id }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        error: "That client code was taken while the proposal was being written. Pick another code and try again.",
      }
    }
    console.error("[proposals] save failed", error)
    return { ok: false, error: UNEXPECTED }
  }
}

// ---------------------------------------------------------------------------
// Revise and edit
// ---------------------------------------------------------------------------

async function loadForRewrite(id: string, workspaceId: string) {
  const proposal = await prisma.proposal.findFirst({
    where: { id, userId: workspaceId },
    select: {
      id: true,
      clientId: true,
      input: true,
      content: true,
      issueDate: true,
      client: { select: { fullName: true, businessName: true, address: true, country: true } },
    },
  })
  if (!proposal) return null
  const brief = proposalBriefSchema.safeParse(proposal.input)
  const draft = parseStoredDraft(proposal.content)
  if (!brief.success || !draft) return null
  return { proposal, brief: brief.data, draft }
}

/** Asks Claude to change the words; the brief and the figures stay as they are. */
export async function reviseProposal(id: string, change: string): Promise<ProposalResult> {
  if (!(await canWrite())) return { ok: false, error: DENIED }
  const instruction = change.trim().slice(0, 2000)
  if (instruction.length < 3) return { ok: false, error: "Say what should change." }
  if (!(await proposalsReady())) return { ok: false, error: PROPOSALS_SETUP_MESSAGE }

  const { workspaceId } = await getWorkspaceIdentity()
  const loaded = await loadForRewrite(id, workspaceId)
  if (!loaded) return { ok: false, error: "That proposal no longer exists." }

  const written = await draftWith(
    revisionMessage({
      brief: loaded.brief,
      client: loaded.proposal.client,
      studioName: await studioName(workspaceId),
      current: loaded.draft,
      change: instruction,
    })
  )
  if ("error" in written) return { ok: false, error: written.error }

  const draft = cleanDraft(written.draft, loaded.brief)
  await prisma.proposal.update({
    where: { id },
    data: { content: asJson(draft), title: draft.projectName, model: written.model },
  })
  revalidateProposals(id, loaded.proposal.clientId)
  return { ok: true, id }
}

const updateSchema = z.object({
  brief: proposalBriefSchema,
  /** Have Claude write it again from the new brief, or keep the words. */
  rewrite: z.boolean(),
})

/**
 * Changes the brief. Without a rewrite only the figures move - price,
 * currency, validity, warranty - and the existing words are re-checked
 * against the new brief (phases trimmed to new days, the operator's project
 * name and platforms applied). With one, Claude starts again from the brief.
 */
export async function updateProposal(id: string, raw: unknown): Promise<ProposalResult> {
  if (!(await canWrite())) return { ok: false, error: DENIED }
  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { brief, rewrite } = parsed.data
  if (!(await proposalsReady())) return { ok: false, error: PROPOSALS_SETUP_MESSAGE }

  const { workspaceId } = await getWorkspaceIdentity()
  const loaded = await loadForRewrite(id, workspaceId)
  if (!loaded) return { ok: false, error: "That proposal no longer exists." }

  let draft: ProposalDraft
  let model: string | undefined
  if (rewrite) {
    const written = await draftWith(
      briefMessage({ brief, client: loaded.proposal.client, studioName: await studioName(workspaceId) })
    )
    if ("error" in written) return { ok: false, error: written.error }
    draft = cleanDraft(written.draft, brief)
    model = written.model
  } else {
    draft = cleanDraft(loaded.draft, brief)
  }

  await prisma.proposal.update({
    where: { id },
    data: {
      input: asJson(brief satisfies ProposalBrief),
      content: asJson(draft),
      title: draft.projectName,
      currency: brief.currency,
      totalAmount: brief.value,
      validUntil: addDays(loaded.proposal.issueDate, brief.validityDays),
      ...(model ? { model } : {}),
    },
  })
  revalidateProposals(id, loaded.proposal.clientId)
  return { ok: true, id }
}

// ---------------------------------------------------------------------------
// Status and delete
// ---------------------------------------------------------------------------

const statusSchema = z.nativeEnum(ProposalStatus)

export async function setProposalStatus(id: string, status: string): Promise<ProposalResult> {
  if (!(await canWrite())) return { ok: false, error: DENIED }
  const parsed = statusSchema.safeParse(status)
  if (!parsed.success) return { ok: false, error: "Unknown status." }
  if (!(await proposalsReady())) return { ok: false, error: PROPOSALS_SETUP_MESSAGE }

  const { workspaceId } = await getWorkspaceIdentity()
  const result = await prisma.proposal.updateMany({
    where: { id, userId: workspaceId },
    data: { status: parsed.data, statusChangedAt: new Date() },
  })
  if (result.count !== 1) return { ok: false, error: "That proposal no longer exists." }

  revalidateProposals(id)
  return { ok: true, id }
}

/**
 * Deletes a proposal. The client it created stays: by now they may have an
 * invoice, a lead or a project hanging off them, and removing a client is a
 * separate, admin-only decision.
 */
export async function deleteProposal(id: string): Promise<ProposalResult> {
  if (!(await canWrite())) return { ok: false, error: DENIED }
  if (!(await proposalsReady())) return { ok: false, error: PROPOSALS_SETUP_MESSAGE }

  const { workspaceId } = await getWorkspaceIdentity()
  const proposal = await prisma.proposal.findFirst({
    where: { id, userId: workspaceId },
    select: { clientId: true },
  })
  if (!proposal) return { ok: false, error: "That proposal no longer exists." }

  await prisma.proposal.deleteMany({ where: { id, userId: workspaceId } })
  revalidateProposals(undefined, proposal.clientId)
  return { ok: true, id }
}
