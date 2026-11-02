"use server"

import { revalidatePath } from "next/cache"
import type { IntegrationProvider, Prisma } from "@prisma/client"

import { getViewer } from "@/lib/access"
import prisma from "@/lib/db"
import { checkClaudeKey, checkMetaConnection } from "@/lib/integrations/checks"
import { encryptSecret, integrationsKey, secretContext, secretHint } from "@/lib/integrations/crypto"
import {
  integrationsReady,
  INTEGRATIONS_KEY_MESSAGE,
  INTEGRATIONS_SETUP_MESSAGE,
  metaConnection,
} from "@/lib/integrations/store"
import { isAdminRole } from "@/lib/permissions"
import { VIEWING_READ_ONLY_MESSAGE } from "@/lib/viewing-rules"

/**
 * Connecting a company's own Meta dataset and Claude key.
 *
 * Owner and admins only - the same people who manage the team - because a
 * token here reports the company's leads and spends the company's money.
 * Every key is checked against the provider before it is saved, encrypted
 * before it is written, and never sent back to the browser.
 *
 * Results rather than throws: Next.js replaces a thrown message with a
 * generic one in production, and "Meta did not accept that token" is the
 * message worth reading.
 */

export type IntegrationResult = { ok: true; warning: string | null } | { ok: false; error: string }

type Manager = { orgId: string; membershipId: string; key: Buffer }

async function manager(): Promise<Manager | { error: string }> {
  const viewer = await getViewer()
  if (viewer.viewing) return { error: VIEWING_READ_ONLY_MESSAGE }
  if (!viewer.orgId || !viewer.membershipId || !isAdminRole(viewer.role, viewer.status)) {
    return { error: "Only the company's owner or an admin can change integrations." }
  }
  if (!(await integrationsReady())) return { error: INTEGRATIONS_SETUP_MESSAGE }
  const key = integrationsKey()
  if (!key) return { error: INTEGRATIONS_KEY_MESSAGE }
  return { orgId: viewer.orgId, membershipId: viewer.membershipId, key }
}

const LABEL: Record<IntegrationProvider, string> = {
  META_CAPI: "Meta Conversions API",
  ANTHROPIC: "Claude",
}

async function save(
  who: Manager,
  provider: IntegrationProvider,
  secret: string,
  config: Prisma.InputJsonValue | undefined,
  summary: string
) {
  const encrypted = encryptSecret(secret, secretContext(who.orgId, provider), who.key)
  const hint = secretHint(secret)

  await prisma.$transaction(async (tx) => {
    await tx.companyIntegration.upsert({
      where: { orgId_provider: { orgId: who.orgId, provider } },
      update: { secret: encrypted, secretHint: hint, config },
      create: { orgId: who.orgId, provider, secret: encrypted, secretHint: hint, config },
    })
    // The company's own trail. Never the secret - not even its last four.
    await tx.memberAuditLog.create({
      data: { orgId: who.orgId, actorId: who.membershipId, action: "integration.saved", summary },
    })
  })

  revalidatePath("/dashboard/settings/integrations")
}

export async function saveMetaIntegration(input: {
  datasetId: string
  accessToken: string
  testEventCode: string
}): Promise<IntegrationResult> {
  const who = await manager()
  if ("error" in who) return { ok: false, error: who.error }

  const datasetId = input.datasetId.trim()
  if (!/^\d{5,30}$/.test(datasetId)) {
    return { ok: false, error: "The dataset ID is the number shown in Events Manager, digits only." }
  }
  const testEventCode = input.testEventCode.trim().slice(0, 64) || null

  // Blank keeps the token already saved, so the dataset or the test code can
  // be changed without fetching the token from Meta again.
  const accessToken = input.accessToken.trim() || (await metaConnection(who.orgId))?.accessToken
  if (!accessToken) return { ok: false, error: "Paste the access token from Events Manager." }

  const check = await checkMetaConnection(datasetId, accessToken)
  if (!check.ok) return { ok: false, error: check.error }

  await save(
    who,
    "META_CAPI",
    accessToken,
    { datasetId, testEventCode },
    `Connected Meta Conversions API to dataset ${datasetId}${testEventCode ? " (test events)" : ""}`
  )
  return { ok: true, warning: check.warning }
}

export async function saveClaudeIntegration(input: { apiKey: string }): Promise<IntegrationResult> {
  const who = await manager()
  if ("error" in who) return { ok: false, error: who.error }

  const apiKey = input.apiKey.trim()
  if (!apiKey.startsWith("sk-ant-")) {
    return { ok: false, error: "That does not look like an Anthropic API key. They start with sk-ant-." }
  }

  const check = await checkClaudeKey(apiKey)
  if (!check.ok) return { ok: false, error: check.error }

  await save(who, "ANTHROPIC", apiKey, undefined, "Connected Claude for proposal writing")
  // The proposal pages say whether Claude is connected.
  revalidatePath("/dashboard/proposals", "layout")
  return { ok: true, warning: check.warning }
}

export async function disconnectIntegration(provider: IntegrationProvider): Promise<IntegrationResult> {
  const who = await manager()
  if ("error" in who) return { ok: false, error: who.error }
  if (provider !== "META_CAPI" && provider !== "ANTHROPIC") return { ok: false, error: "Unknown integration." }

  await prisma.$transaction(async (tx) => {
    await tx.companyIntegration.deleteMany({ where: { orgId: who.orgId, provider } })
    await tx.memberAuditLog.create({
      data: {
        orgId: who.orgId,
        actorId: who.membershipId,
        action: "integration.removed",
        summary: `Disconnected ${LABEL[provider]}`,
      },
    })
  })

  revalidatePath("/dashboard/settings/integrations")
  if (provider === "ANTHROPIC") revalidatePath("/dashboard/proposals", "layout")
  return { ok: true, warning: null }
}
