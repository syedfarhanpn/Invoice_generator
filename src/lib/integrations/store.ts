import type { IntegrationProvider, Prisma } from "@prisma/client"

import prisma from "@/lib/db"

import { decryptSecret, encryptSecret, integrationsKey, secretContext, secretHint } from "./crypto"

/**
 * A company's own connections to Meta and Claude.
 *
 * Who may change which: a company's owner and admins add their own Claude
 * key (src/app/dashboard/settings/integrations); the platform admin sets up
 * each company's Meta connection from the Accounts console, and companies
 * only see its status (src/app/dashboard/admin).
 *
 * Every lookup is by company. There is deliberately no "platform default"
 * once the table exists: falling back to someone else's Meta token would
 * report one company's leads to another company's ad account, and falling
 * back to someone else's Claude key would bill them for it.
 *
 * Before the migration has run, the server's own settings (META_* and
 * ANTHROPIC_API_KEY) keep working exactly as they did - but only while one
 * company exists for them to belong to. Add a second company first and
 * neither is used, rather than shared.
 */

let ready = false

/** Whether the CompanyIntegration table exists yet. A yes is remembered. */
export async function integrationsReady(): Promise<boolean> {
  if (ready) return true
  const rows = await prisma.$queryRaw<{ table: string | null }[]>`
    SELECT to_regclass('public."CompanyIntegration"')::text AS "table"
  `
  ready = rows[0]?.table != null
  return ready
}

export const INTEGRATIONS_SETUP_MESSAGE =
  "Integrations need a one-time database update. Run `npm run db:migrate`, then reload this page."

export const INTEGRATIONS_KEY_MESSAGE =
  "Integrations cannot be saved until the server has INTEGRATIONS_SECRET_KEY set. Add it to the environment and restart."

/** The server's own settings apply only while there is one company to own them. */
async function serverSettingsApply(): Promise<boolean> {
  return (await prisma.organisation.count()) <= 1
}

type Stored = { config: Record<string, unknown>; secret: string }

/** A company's connection with its secret decrypted, or null. */
async function loadIntegration(orgId: string, provider: IntegrationProvider): Promise<Stored | null> {
  const key = integrationsKey()
  if (!key) return null

  const row = await prisma.companyIntegration.findUnique({
    where: { orgId_provider: { orgId, provider } },
    select: { config: true, secret: true },
  })
  if (!row) return null

  const secret = decryptSecret(row.secret, secretContext(orgId, provider), key)
  if (!secret) {
    // Never the value - just enough to find the cause, which is almost
    // always INTEGRATIONS_SECRET_KEY differing between deployments.
    console.error(`[integrations] ${provider} for ${orgId} could not be decrypted. Check INTEGRATIONS_SECRET_KEY.`)
    return null
  }

  const config = row.config && typeof row.config === "object" && !Array.isArray(row.config) ? row.config : {}
  return { config: config as Record<string, unknown>, secret }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export type MetaConnection = {
  datasetId: string
  accessToken: string
  testEventCode: string | null
}

/** Both or nothing, and a numeric dataset id - the rules the old env had. */
function metaConnectionFrom(
  datasetId: string | null,
  accessToken: string | null,
  testEventCode: string | null
): MetaConnection | null {
  if (!datasetId || !accessToken || !/^\d+$/.test(datasetId)) return null
  return { datasetId, accessToken, testEventCode }
}

/** Where this company's lead events go, or null when it has not connected Meta. */
export async function metaConnection(orgId: string | null): Promise<MetaConnection | null> {
  if (!(await integrationsReady())) {
    if (!(await serverSettingsApply())) return null
    return metaConnectionFrom(
      text(process.env.META_DATASET_ID),
      text(process.env.META_CAPI_ACCESS_TOKEN),
      text(process.env.META_TEST_EVENT_CODE)
    )
  }

  if (!orgId) return null
  const stored = await loadIntegration(orgId, "META_CAPI")
  if (!stored) return null
  return metaConnectionFrom(text(stored.config.datasetId), stored.secret, text(stored.config.testEventCode))
}

// ---------------------------------------------------------------------------
// Claude
// ---------------------------------------------------------------------------

/** This company's own Anthropic key, or null when it has not added one. */
export async function claudeKey(orgId: string | null): Promise<string | null> {
  if (!(await integrationsReady())) {
    return (await serverSettingsApply()) ? text(process.env.ANTHROPIC_API_KEY) : null
  }

  if (!orgId) return null
  return (await loadIntegration(orgId, "ANTHROPIC"))?.secret ?? null
}

export async function claudeConnected(orgId: string | null): Promise<boolean> {
  return (await claudeKey(orgId)) != null
}

// ---------------------------------------------------------------------------
// For the settings page
// ---------------------------------------------------------------------------

/** What the page may show. Never the secret: only its last four characters. */
export type IntegrationSummary = {
  connected: boolean
  /** False when a secret is stored but this server cannot decrypt it. */
  readable: boolean
  hint: string | null
  datasetId: string | null
  testEventCode: string | null
  updatedAt: Date | null
}

const NOT_CONNECTED: IntegrationSummary = {
  connected: false,
  readable: true,
  hint: null,
  datasetId: null,
  testEventCode: null,
  updatedAt: null,
}

export type CompanySummaries = Record<IntegrationProvider, IntegrationSummary>

const EMPTY_SUMMARIES: CompanySummaries = { META_CAPI: NOT_CONNECTED, ANTHROPIC: NOT_CONNECTED }

/** Several companies in one query - the platform admin's company list. */
export async function integrationSummariesFor(orgIds: string[]): Promise<Map<string, CompanySummaries>> {
  const rows = await prisma.companyIntegration.findMany({
    where: { orgId: { in: orgIds } },
    select: { orgId: true, provider: true, config: true, secret: true, secretHint: true, updatedAt: true },
  })
  const key = integrationsKey()

  const byCompany = new Map<string, CompanySummaries>()
  for (const row of rows) {
    const config = (row.config && typeof row.config === "object" && !Array.isArray(row.config) ? row.config : {}) as Record<string, unknown>
    const summaries = byCompany.get(row.orgId) ?? { ...EMPTY_SUMMARIES }
    summaries[row.provider] = {
      connected: true,
      readable: key != null && decryptSecret(row.secret, secretContext(row.orgId, row.provider), key) != null,
      hint: row.secretHint,
      datasetId: text(config.datasetId),
      testEventCode: text(config.testEventCode),
      updatedAt: row.updatedAt,
    }
    byCompany.set(row.orgId, summaries)
  }
  return byCompany
}

export async function integrationSummaries(orgId: string): Promise<CompanySummaries> {
  return (await integrationSummariesFor([orgId])).get(orgId) ?? EMPTY_SUMMARIES
}

export function emptySummaries(): CompanySummaries {
  return EMPTY_SUMMARIES
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Encrypts and saves one connection, inside the caller's transaction so the
 * audit row each caller writes lands with it or not at all. The only place
 * a secret is written, so it is the only place it could be written in clear.
 */
export async function upsertIntegration(
  tx: Prisma.TransactionClient,
  args: {
    orgId: string
    provider: IntegrationProvider
    secret: string
    config: Prisma.InputJsonValue | undefined
    key: Buffer
  }
) {
  const secret = encryptSecret(args.secret, secretContext(args.orgId, args.provider), args.key)
  const hint = secretHint(args.secret)
  await tx.companyIntegration.upsert({
    where: { orgId_provider: { orgId: args.orgId, provider: args.provider } },
    update: { secret, secretHint: hint, config: args.config },
    create: { orgId: args.orgId, provider: args.provider, secret, secretHint: hint, config: args.config },
  })
}
