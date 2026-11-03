"use server"

import { revalidatePath } from "next/cache"

import { getViewer } from "@/lib/access"
import prisma from "@/lib/db"
import { checkClaudeKey } from "@/lib/integrations/checks"
import { integrationsKey } from "@/lib/integrations/crypto"
import {
  integrationsReady,
  INTEGRATIONS_KEY_MESSAGE,
  INTEGRATIONS_SETUP_MESSAGE,
  upsertIntegration,
} from "@/lib/integrations/store"
import type { IntegrationResult } from "@/lib/integrations/view"
import { isAdminRole } from "@/lib/permissions"
import { VIEWING_READ_ONLY_MESSAGE } from "@/lib/viewing-rules"

/**
 * A company connecting its own Claude key.
 *
 * Owner and admins only - the same people who manage the team - because the
 * key spends the company's money. Checked against Anthropic before it is
 * saved, encrypted before it is written, never sent back to the browser.
 *
 * Meta is deliberately NOT here. The platform admin sets up each company's
 * Conversions API from the Accounts console (src/app/dashboard/admin), and
 * there is no action a company could call to change it - hiding a form
 * would not have been enough.
 *
 * Results rather than throws: Next.js replaces a thrown message with a
 * generic one in production, and "Anthropic did not accept that key" is the
 * message worth reading.
 */

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

function revalidateClaude() {
  revalidatePath("/dashboard/settings/integrations")
  // The proposal pages say whether Claude is connected.
  revalidatePath("/dashboard/proposals", "layout")
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

  await prisma.$transaction(async (tx) => {
    await upsertIntegration(tx, { orgId: who.orgId, provider: "ANTHROPIC", secret: apiKey, config: undefined, key: who.key })
    // The company's own trail. Never the key - not even its last four.
    await tx.memberAuditLog.create({
      data: {
        orgId: who.orgId,
        actorId: who.membershipId,
        action: "integration.saved",
        summary: "Connected Claude for proposal writing",
      },
    })
  })

  revalidateClaude()
  return { ok: true, warning: check.warning }
}

export async function disconnectClaude(): Promise<IntegrationResult> {
  const who = await manager()
  if ("error" in who) return { ok: false, error: who.error }

  await prisma.$transaction(async (tx) => {
    await tx.companyIntegration.deleteMany({ where: { orgId: who.orgId, provider: "ANTHROPIC" } })
    await tx.memberAuditLog.create({
      data: { orgId: who.orgId, actorId: who.membershipId, action: "integration.removed", summary: "Disconnected Claude" },
    })
  })

  revalidateClaude()
  return { ok: true, warning: null }
}
