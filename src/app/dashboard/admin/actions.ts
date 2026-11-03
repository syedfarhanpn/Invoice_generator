"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Prisma, type Role } from "@prisma/client"

import prisma from "@/lib/db"
import { requireSuperAdmin } from "@/lib/current-user"
import { canChangeRole, canRestore, canSuspend, type AdminTarget } from "@/lib/admin-guards"
import { firstIssue, newCompanySchema, ownershipRefusal, slugify, uniqueSlug } from "@/lib/companies"
import { checkMetaConnection } from "@/lib/integrations/checks"
import { integrationsKey } from "@/lib/integrations/crypto"
import {
  integrationsReady,
  INTEGRATIONS_KEY_MESSAGE,
  INTEGRATIONS_SETUP_MESSAGE,
  metaConnection,
  upsertIntegration,
} from "@/lib/integrations/store"
import { normalizeMetaInput, type IntegrationResult, type MetaInput } from "@/lib/integrations/view"
import { sendWorkspaceInvite, type InviteOutcome } from "@/lib/invites"
import { VIEWING_COOKIE, VIEWING_COOKIE_OPTIONS, viewingOrgId } from "@/lib/viewing"
import { VIEWING_READ_ONLY_MESSAGE } from "@/lib/viewing-rules"

// ---------------------------------------------------------------------------
// Platform administration: companies and the accounts in them.
//
// Every action here: requires SUPER_ADMIN, re-reads the target inside a
// transaction (never trusts what the page rendered), runs the pure guard,
// writes, and records an audit row in the SAME transaction - so a change can
// never exist without the record of who made it.
//
// The platform admin sees inside a company only by viewing it, and viewing
// is read-only (src/lib/access.ts, src/lib/db.ts). Opening and closing a view
// are recorded here like any other act, in the trail only the platform admin
// can read - never in the company's own.
// ---------------------------------------------------------------------------

const userIdSchema = z.string().min(1).max(64)
const orgIdSchema = z.string().min(1).max(64)
const roleSchema = z.enum(["USER", "SUPER_ADMIN"])

function bootstrapAdminEmail(): string | null {
  return process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim() || null
}

const TARGET_SELECT = { id: true, email: true, role: true, status: true } as const

function toTarget(row: { id: string; email: string; role: Role; status: AdminTarget["status"] }): AdminTarget {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    isBootstrapAdmin: row.email.toLowerCase().trim() === bootstrapAdminEmail(),
  }
}

/**
 * Post-condition assert, run inside the transaction after the write. The
 * pre-flight guard gives a good error message, but its count can go stale
 * under READ COMMITTED; this cannot, because the UPDATE has already taken its
 * row locks. Throwing here rolls the whole transaction back.
 */
async function assertSuperAdminRemains(tx: Prisma.TransactionClient) {
  const remaining = await tx.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } })
  if (remaining < 1) {
    throw new Error("That change would leave the product with no active super admin.")
  }
}

function revalidateAdmin() {
  revalidatePath("/dashboard/admin")
}

// ---------------------------------------------------------------------------
// Adding a company - the only way a new company comes into being.
//
// Replaces the old "Grant access" form. On a platform of companies, an
// account with no company opens onto "you are not in a workspace" and
// nothing else; what a new customer needs is a company with an owner, who
// then brings in their own team from Team Management.
// ---------------------------------------------------------------------------

/** A refusal written for the operator, as opposed to a failure. */
class CompanyRefusal extends Error {}

export type CreateCompanyResult =
  | { ok: true; company: string; ownerEmail: string; invite: InviteOutcome }
  | { ok: false; error: string }

export async function createCompany(raw: unknown): Promise<CreateCompanyResult> {
  const actor = await requireSuperAdmin()
  const parsed = newCompanySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const input = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: input.ownerEmail },
        select: {
          id: true,
          name: true,
          role: true,
          status: true,
          memberships: { select: { org: { select: { name: true } } } },
        },
      })

      const refusal = ownershipRefusal(
        existing && {
          isPlatformAdmin: existing.role === "SUPER_ADMIN",
          isSuspended: existing.status === "SUSPENDED",
          companies: existing.memberships.map((m) => m.org.name),
        }
      )
      if (refusal) throw new CompanyRefusal(refusal)

      const base = slugify(input.companyName)
      const taken = await tx.organisation.findMany({
        where: { slug: { startsWith: base } },
        select: { slug: true },
      })
      const org = await tx.organisation.create({
        data: { name: input.companyName, slug: uniqueSlug(base, new Set(taken.map((t) => t.slug))) },
        select: { id: true },
      })

      // The User row is the invitation, as it is for a team member: signing
      // in with this address is what connects them to the company.
      const owner =
        existing ??
        (await tx.user.create({
          data: { email: input.ownerEmail, name: input.ownerName, role: "USER", status: "ACTIVE" },
          select: { id: true, name: true },
        }))
      if (!owner.name) {
        await tx.user.update({ where: { id: owner.id }, data: { name: input.ownerName } })
      }

      await tx.membership.create({
        data: { orgId: org.id, userId: owner.id, role: "OWNER", status: "INVITED", invitedAt: new Date() },
      })

      // The company's name on their rail and their documents from the first
      // sign-in, rather than the product's. An account from before companies
      // may already hold a profile; that one is kept and only attached.
      await tx.businessProfile.upsert({
        where: { userId: owner.id },
        update: { orgId: org.id },
        create: {
          userId: owner.id,
          orgId: org.id,
          businessName: input.companyName,
          ownerName: input.ownerName,
          email: input.ownerEmail,
          currency: input.currency,
        },
      })

      await tx.adminAuditLog.create({
        data: {
          actorId: actor.id,
          targetUserId: owner.id,
          action: "company.created",
          meta: { company: input.companyName, email: input.ownerEmail, orgId: org.id },
        },
      })
    })
  } catch (error) {
    if (error instanceof CompanyRefusal) return { ok: false, error: error.message }
    // The unique email or slug, taken by a request that landed in between.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "That owner or company was added a moment ago. Refresh the list and check." }
    }
    throw error
  }

  revalidateAdmin()

  // Outside the transaction, as for a team member: the company exists now,
  // and a mail provider timing out must not undo it. The result carries the
  // link so it can be sent by hand if the email did not go.
  const invite = await sendWorkspaceInvite({
    email: input.ownerEmail,
    role: "OWNER",
    title: null,
    note: null,
    brandName: input.companyName,
    inviterName: null,
    replyTo: actor.email,
  })

  return { ok: true, company: input.companyName, ownerEmail: input.ownerEmail, invite }
}

/**
 * Takes a person out of their company, keeping their account.
 *
 * What Team Management cannot do: it suspends, and a suspended membership
 * still holds a place - which is exactly wrong for the platform admin, who
 * should belong to no company at all. Never the owner: a company's records
 * are filed under them, so it cannot be left without one. Their assignments
 * are released rather than deleted (the foreign keys are SET NULL), so the
 * work they were on stays and simply becomes unassigned.
 */
export async function removeFromCompany(rawUserId: string) {
  const actor = await requireSuperAdmin()
  const userId = userIdSchema.parse(rawUserId)

  await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, org: { select: { name: true } }, user: { select: { email: true } } },
    })
    if (!membership) throw new Error("That account is not in a company.")
    if (membership.role === "OWNER") {
      throw new Error(`The owner cannot be removed from ${membership.org.name}. A company needs its owner.`)
    }

    await tx.membership.delete({ where: { id: membership.id } })
    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        targetUserId: userId,
        action: "user.removed_from_company",
        meta: { email: membership.user.email, company: membership.org.name },
      },
    })
  })

  revalidateAdmin()
}

// ---------------------------------------------------------------------------
// A company's Meta Conversions API - set up here, by the platform admin.
//
// Companies see only its status (Settings - Integrations) and have no action
// that could change it. Results rather than throws, so "Meta did not accept
// that token" survives production, where thrown messages are replaced.
// ---------------------------------------------------------------------------

type MetaTarget = { actorId: string; org: { id: string; name: string }; key: Buffer }

/** The company, once everything a Meta change needs is in place. */
async function metaTarget(rawOrgId: string): Promise<MetaTarget | { error: string }> {
  const actor = await requireSuperAdmin()
  // The database would refuse the write anyway; this says why.
  if (await viewingOrgId()) return { error: VIEWING_READ_ONLY_MESSAGE }
  if (!(await integrationsReady())) return { error: INTEGRATIONS_SETUP_MESSAGE }
  const key = integrationsKey()
  if (!key) return { error: INTEGRATIONS_KEY_MESSAGE }

  const parsed = orgIdSchema.safeParse(rawOrgId)
  const org = parsed.success
    ? await prisma.organisation.findUnique({ where: { id: parsed.data }, select: { id: true, name: true } })
    : null
  if (!org) return { error: "That company no longer exists." }

  return { actorId: actor.id, org, key }
}

export async function saveCompanyMeta(rawOrgId: string, input: MetaInput): Promise<IntegrationResult> {
  const target = await metaTarget(rawOrgId)
  if ("error" in target) return { ok: false, error: target.error }

  const fields = normalizeMetaInput(input)
  if (!fields.ok) return { ok: false, error: fields.error }

  // A blank token keeps the one already saved for this company.
  const accessToken = fields.accessToken ?? (await metaConnection(target.org.id))?.accessToken
  if (!accessToken) return { ok: false, error: "Paste the access token from Events Manager." }

  const check = await checkMetaConnection(fields.datasetId, accessToken)
  if (!check.ok) return { ok: false, error: check.error }

  await prisma.$transaction(async (tx) => {
    await upsertIntegration(tx, {
      orgId: target.org.id,
      provider: "META_CAPI",
      secret: accessToken,
      config: { datasetId: fields.datasetId, testEventCode: fields.testEventCode },
      key: target.key,
    })
    await tx.adminAuditLog.create({
      data: {
        actorId: target.actorId,
        action: "company.meta_connected",
        // Never the token, not even its last four.
        meta: {
          company: target.org.name,
          orgId: target.org.id,
          datasetId: fields.datasetId,
          testEvents: fields.testEventCode != null,
        },
      },
    })
  })

  revalidateAdmin()
  revalidatePath("/dashboard/settings/integrations")
  return { ok: true, warning: check.warning }
}

export async function disconnectCompanyMeta(rawOrgId: string): Promise<IntegrationResult> {
  const target = await metaTarget(rawOrgId)
  if ("error" in target) return { ok: false, error: target.error }

  await prisma.$transaction(async (tx) => {
    await tx.companyIntegration.deleteMany({ where: { orgId: target.org.id, provider: "META_CAPI" } })
    await tx.adminAuditLog.create({
      data: {
        actorId: target.actorId,
        action: "company.meta_disconnected",
        meta: { company: target.org.name, orgId: target.org.id },
      },
    })
  })

  revalidateAdmin()
  revalidatePath("/dashboard/settings/integrations")
  return { ok: true, warning: null }
}

// ---------------------------------------------------------------------------
// Viewing a company, read-only.
// ---------------------------------------------------------------------------

/**
 * Opens a company for the platform admin to look through.
 *
 * Revalidates the whole tree on the way in and out: the browser keeps pages
 * it has already shown (see staleTimes in next.config.ts), and without this
 * it could show one company's screen while the banner names another.
 */
export async function viewCompany(rawOrgId: string) {
  const actor = await requireSuperAdmin()
  const orgId = orgIdSchema.parse(rawOrgId)

  const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { id: true, name: true } })
  if (!org) throw new Error("That company no longer exists.")

  await prisma.adminAuditLog.create({
    data: { actorId: actor.id, action: "company.viewed", meta: { company: org.name, orgId: org.id } },
  })

  ;(await cookies()).set(VIEWING_COOKIE, org.id, VIEWING_COOKIE_OPTIONS)
  revalidatePath("/", "layout")
  redirect("/dashboard")
}

/** Closes the view and returns to the Accounts console. */
export async function stopViewingCompany() {
  const actor = await requireSuperAdmin()
  const cookieStore = await cookies()
  const orgId = cookieStore.get(VIEWING_COOKIE)?.value

  if (orgId) {
    const org = await prisma.organisation.findUnique({ where: { id: orgId }, select: { name: true } })
    await prisma.adminAuditLog.create({
      data: { actorId: actor.id, action: "company.view_ended", meta: { company: org?.name ?? null, orgId } },
    })
  }

  cookieStore.delete(VIEWING_COOKIE)
  revalidatePath("/", "layout")
  redirect("/dashboard/admin")
}

// ---------------------------------------------------------------------------
// Suspend / restore
// ---------------------------------------------------------------------------
export async function suspendUser(rawId: string) {
  const actor = await requireSuperAdmin()
  const id = userIdSchema.parse(rawId)

  await prisma.$transaction(async (tx) => {
    const row = await tx.user.findUnique({ where: { id }, select: TARGET_SELECT })
    if (!row) throw new Error("Account not found.")

    const guard = canSuspend(actor, toTarget(row))
    if (!guard.ok) throw new Error(guard.reason)

    await tx.user.update({
      where: { id },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    })
    await tx.adminAuditLog.create({
      data: { actorId: actor.id, targetUserId: id, action: "user.suspended", meta: { email: row.email } },
    })
    await assertSuperAdminRemains(tx)
  })

  revalidateAdmin()
}

export async function restoreUser(rawId: string) {
  const actor = await requireSuperAdmin()
  const id = userIdSchema.parse(rawId)

  await prisma.$transaction(async (tx) => {
    const row = await tx.user.findUnique({ where: { id }, select: TARGET_SELECT })
    if (!row) throw new Error("Account not found.")

    const guard = canRestore(actor, toTarget(row))
    if (!guard.ok) throw new Error(guard.reason)

    await tx.user.update({ where: { id }, data: { status: "ACTIVE", suspendedAt: null } })
    await tx.adminAuditLog.create({
      data: { actorId: actor.id, targetUserId: id, action: "user.restored", meta: { email: row.email } },
    })
  })

  revalidateAdmin()
}

// ---------------------------------------------------------------------------
// Role changes
// ---------------------------------------------------------------------------
export async function changeUserRole(rawId: string, rawRole: string) {
  const actor = await requireSuperAdmin()
  const id = userIdSchema.parse(rawId)
  const newRole = roleSchema.parse(rawRole)

  await prisma.$transaction(async (tx) => {
    const row = await tx.user.findUnique({ where: { id }, select: TARGET_SELECT })
    if (!row) throw new Error("Account not found.")

    // Counted inside the transaction so the guard sees a consistent number.
    const activeSuperAdmins = await tx.user.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" },
    })

    const guard = canChangeRole(actor, toTarget(row), newRole, activeSuperAdmins)
    if (!guard.ok) throw new Error(guard.reason)

    await tx.user.update({ where: { id }, data: { role: newRole } })
    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        targetUserId: id,
        action: "user.role_changed",
        meta: { email: row.email, from: row.role, to: newRole },
      },
    })
    await assertSuperAdminRemains(tx)
  })

  revalidateAdmin()
}
