"use server"

import { revalidatePath } from "next/cache"
import type { MemberRole, MemberStatus } from "@prisma/client"

import { assertPermission, ACCESS_TO_DB, getViewer } from "@/lib/access"
import prisma from "@/lib/db"
import { displayNameFor } from "@/lib/member-names"
// One role-label map for the whole product: the audit log below and the table
// on screen must never disagree about what a role is called.
import { ROLE_LABEL } from "@/lib/members"
import { sendWorkspaceInvite, type InviteOutcome } from "@/lib/invites"
import { parseAccess, parseModule, type Access, type Module } from "@/lib/permissions"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

/**
 * Team Management writes.
 *
 * This is the module that can grant every other permission, so the guards
 * here are stricter than elsewhere and most of them exist to stop a mistake
 * that cannot be undone from inside the product:
 *
 *  - Nobody can change their OWN role or status. Otherwise the only thing
 *    between an administrator and locking themselves out is a mis-click.
 *  - The OWNER cannot be demoted, suspended or have their access edited by
 *    anyone. Someone must always be able to put a broken matrix back.
 *  - A workspace cannot be left with no active administrator. The check runs
 *    inside the same transaction as the write, so two people demoting each
 *    other at the same moment cannot both succeed.
 *
 * Every change writes a MemberAuditLog row in the same transaction. A change
 * of access that left no trace would be the one thing you most want a trace
 * of.
 */

const ROLES: MemberRole[] = [
  "ADMIN",
  "PROJECT_MANAGER",
  "SALES_EXECUTIVE",
  "DEVELOPER",
  "SUPPORT_EXECUTIVE",
  "ACCOUNTANT",
  "CONTENT_CREATOR",
]

/** Roles that can administer the workspace. Used by the lockout guard. */
const ADMIN_ROLES: MemberRole[] = ["OWNER", "ADMIN"]

type Actor = { orgId: string; membershipId: string }

/** The caller, having proved they may edit the team. */
async function actor(): Promise<Actor> {
  const viewer = await assertPermission("team", "write")
  if (!viewer.orgId || !viewer.membershipId) {
    throw new Error("You are not in a workspace.")
  }
  return { orgId: viewer.orgId, membershipId: viewer.membershipId }
}

/** The member being acted on, confirmed to be in the caller's workspace. */
async function target(orgId: string, membershipId: string) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, orgId },
    select: {
      id: true,
      role: true,
      status: true,
      user: { select: { name: true, email: true, businessProfile: { select: { ownerName: true } } } },
    },
  })
  // Scoped by orgId, so an id from another workspace is simply not found.
  if (!membership) throw new Error("That team member no longer exists.")
  return membership
}

async function record(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  entry: {
    orgId: string
    actorId: string
    targetId: string | null
    action: string
    summary: string
    meta?: Record<string, unknown>
  }
) {
  await tx.memberAuditLog.create({
    data: {
      orgId: entry.orgId,
      actorId: entry.actorId,
      targetId: entry.targetId,
      action: entry.action,
      summary: entry.summary,
      meta: entry.meta ? (entry.meta as object) : undefined,
    },
  })
}

export async function inviteMember(input: {
  email: string
  role: string
  departmentId: string | null
  title: string | null
  /** An optional line from the inviter, carried into the email. */
  note?: string | null
}): Promise<InviteOutcome> {
  const { orgId, membershipId } = await actor()

  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.")

  const role = ROLES.includes(input.role as MemberRole) ? (input.role as MemberRole) : "DEVELOPER"

  const departmentId = input.departmentId
    ? (
        await prisma.department.findFirst({
          where: { id: input.departmentId, orgId },
          select: { id: true },
        })
      )?.id ?? null
    : null
  if (input.departmentId && !departmentId) throw new Error("That department does not exist.")

  await prisma.$transaction(async (tx) => {
    // The User row is the invitation. getCurrentUser() finds people by email,
    // so when they sign in with Supabase this row is what connects them to
    // the workspace - no token table and nothing to expire.
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email, role: "USER" },
      select: { id: true },
    })

    const existing = await tx.membership.findFirst({
      where: { orgId, userId: user.id },
      select: { id: true },
    })
    if (existing) throw new Error("That person is already in this workspace.")

    const created = await tx.membership.create({
      data: {
        orgId,
        userId: user.id,
        role,
        status: "INVITED",
        title: input.title?.trim() || null,
        departmentId,
        invitedAt: new Date(),
      },
      select: { id: true },
    })

    await record(tx, {
      orgId,
      actorId: membershipId,
      targetId: created.id,
      action: "member.invited",
      summary: `Invited ${email} as ${ROLE_LABEL[role]}`,
      meta: { email, role },
    })
  })

  revalidatePath("/team")

  // Outside the transaction on purpose: the member is legitimately in the
  // workspace now, and a mail provider timing out must not undo that.
  const outcome = await sendWorkspaceInvite({
    email,
    role,
    title: input.title?.trim() || null,
    note: input.note?.trim() || null,
    ...(await inviteContext()),
  })

  revalidatePath("/team")
  return outcome
}

/**
 * Resends the invitation for someone already in the workspace.
 *
 * The three people invited before this product could send email have User and
 * Membership rows but no auth account; this is how they get one without being
 * removed and re-added, which would lose their role, department and audit
 * trail.
 */
export async function resendInvite(
  membershipId: string,
  note?: string | null
): Promise<InviteOutcome> {
  const { orgId } = await actor()

  const member = await prisma.membership.findFirst({
    // Scoped by orgId, so an id from another workspace is simply not found.
    where: { id: membershipId, orgId },
    select: { role: true, title: true, user: { select: { email: true } } },
  })
  if (!member) throw new Error("That team member no longer exists.")

  return sendWorkspaceInvite({
    email: member.user.email,
    role: member.role,
    title: member.title,
    note: note?.trim() || null,
    ...(await inviteContext()),
  })
}

/** Who the invitation is from: the company, and the person sending it. */
async function inviteContext() {
  const identity = await getWorkspaceIdentity()
  return {
    brandName: identity.brandName,
    inviterName: identity.displayName,
    replyTo: identity.email,
  }
}

export async function setMemberRole(membershipId: string, role: string) {
  const { orgId, membershipId: actorId } = await actor()

  // Rule: nobody edits their own role.
  if (membershipId === actorId) {
    throw new Error("You cannot change your own role. Ask another administrator.")
  }

  const member = await target(orgId, membershipId)
  if (member.role === "OWNER") throw new Error("The workspace owner's role cannot be changed.")

  const next = ROLES.includes(role as MemberRole) ? (role as MemberRole) : null
  if (!next) throw new Error("That is not a role.")
  if (next === member.role) return

  await prisma.$transaction(async (tx) => {
    // Inside the transaction, so two simultaneous demotions cannot both pass
    // a check that was true when each of them read it.
    if (ADMIN_ROLES.includes(member.role) && !ADMIN_ROLES.includes(next)) {
      const remaining = await tx.membership.count({
        where: {
          orgId,
          status: "ACTIVE",
          role: { in: ADMIN_ROLES },
          id: { not: membershipId },
        },
      })
      if (remaining === 0) {
        throw new Error(
          "This is the last active administrator. Promote someone else before changing this role."
        )
      }
    }

    await tx.membership.update({ where: { id: membershipId }, data: { role: next } })

    await record(tx, {
      orgId,
      actorId,
      targetId: membershipId,
      action: "member.role_changed",
      summary: `Changed ${displayNameFor(member.user)} from ${ROLE_LABEL[member.role]} to ${ROLE_LABEL[next]}`,
      meta: { from: member.role, to: next },
    })
  })

  revalidatePath("/team")
}

export async function setMemberStatus(membershipId: string, status: string) {
  const { orgId, membershipId: actorId } = await actor()

  if (membershipId === actorId) {
    throw new Error("You cannot change your own status.")
  }

  const member = await target(orgId, membershipId)
  if (member.role === "OWNER") throw new Error("The workspace owner cannot be suspended.")

  const allowed: MemberStatus[] = ["ACTIVE", "SUSPENDED"]
  const next = allowed.includes(status as MemberStatus) ? (status as MemberStatus) : null
  if (!next) throw new Error("That is not a status.")
  if (next === member.status) return

  await prisma.$transaction(async (tx) => {
    if (next === "SUSPENDED" && ADMIN_ROLES.includes(member.role)) {
      const remaining = await tx.membership.count({
        where: { orgId, status: "ACTIVE", role: { in: ADMIN_ROLES }, id: { not: membershipId } },
      })
      if (remaining === 0) {
        throw new Error("This is the last active administrator and cannot be suspended.")
      }
    }

    await tx.membership.update({
      where: { id: membershipId },
      data: { status: next, joinedAt: next === "ACTIVE" ? (member.status === "INVITED" ? new Date() : undefined) : undefined },
    })

    await record(tx, {
      orgId,
      actorId,
      targetId: membershipId,
      action: next === "SUSPENDED" ? "member.suspended" : "member.reinstated",
      summary: `${next === "SUSPENDED" ? "Suspended" : "Reinstated"} ${displayNameFor(member.user)}`,
      meta: { from: member.status, to: next },
    })
  })

  revalidatePath("/team")
}

export async function setMemberDepartment(membershipId: string, departmentId: string | null) {
  const { orgId, membershipId: actorId } = await actor()
  const member = await target(orgId, membershipId)

  const resolved = departmentId
    ? await prisma.department.findFirst({
        where: { id: departmentId, orgId },
        select: { id: true, name: true },
      })
    : null
  if (departmentId && !resolved) throw new Error("That department does not exist.")

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: membershipId },
      data: { departmentId: resolved?.id ?? null },
    })
    await record(tx, {
      orgId,
      actorId,
      targetId: membershipId,
      action: "member.department_changed",
      summary: `Moved ${displayNameFor(member.user)} to ${resolved?.name ?? "no department"}`,
      meta: { departmentId: resolved?.id ?? null },
    })
  })

  revalidatePath("/team")
}

/**
 * Replace the whole permission matrix for a role, or for one person.
 *
 * Written as a set rather than one grant at a time so the screen's Save is
 * atomic: a half-applied matrix is a security state nobody chose.
 */
export async function setPermissions(input: {
  scope: "role" | "member"
  /** A MemberRole when scope is "role", a membership id when it is "member". */
  key: string
  grants: Record<string, string>
}) {
  const { orgId, membershipId: actorId } = await actor()

  const entries: { module: Module; access: Access }[] = []
  for (const [rawModule, rawAccess] of Object.entries(input.grants)) {
    const moduleKey = parseModule(rawModule)
    const access = parseAccess(rawAccess)
    // Anything unrecognised is dropped rather than stored - a row nothing
    // reads would look like a setting that had taken effect.
    if (moduleKey && access) entries.push({ module: moduleKey, access })
  }

  if (input.scope === "role") {
    const role = ROLES.includes(input.key as MemberRole) ? (input.key as MemberRole) : null
    if (!role) throw new Error("That is not a role.")

    await prisma.$transaction(async (tx) => {
      await tx.permissionGrant.deleteMany({ where: { orgId, role } })
      if (entries.length > 0) {
        await tx.permissionGrant.createMany({
          data: entries.map((entry) => ({
            orgId,
            role,
            module: entry.module,
            access: ACCESS_TO_DB[entry.access],
          })),
        })
      }
      await record(tx, {
        orgId,
        actorId,
        targetId: null,
        action: "role.permissions_changed",
        summary: `Changed what ${ROLE_LABEL[role]} can access`,
        meta: { role, grants: Object.fromEntries(entries.map((e) => [e.module, e.access])) },
      })
    })
  } else {
    if (input.key === actorId) {
      throw new Error("You cannot change your own permissions. Ask another administrator.")
    }
    const member = await target(orgId, input.key)
    if (member.role === "OWNER") {
      throw new Error("The workspace owner always has full access.")
    }

    await prisma.$transaction(async (tx) => {
      await tx.permissionGrant.deleteMany({ where: { membershipId: member.id } })
      if (entries.length > 0) {
        await tx.permissionGrant.createMany({
          data: entries.map((entry) => ({
            orgId,
            membershipId: member.id,
            module: entry.module,
            access: ACCESS_TO_DB[entry.access],
          })),
        })
      }
      await record(tx, {
        orgId,
        actorId,
        targetId: member.id,
        action: "member.permissions_changed",
        summary: `Changed what ${displayNameFor(member.user)} can access`,
        meta: { grants: Object.fromEntries(entries.map((e) => [e.module, e.access])) },
      })
    })
  }

  revalidatePath("/team")
}

export async function createDepartment(name: string) {
  const { orgId, membershipId: actorId } = await actor()

  const trimmed = name.trim()
  if (!trimmed) throw new Error("A department needs a name.")

  const existing = await prisma.department.findFirst({
    where: { orgId, name: trimmed },
    select: { id: true },
  })
  if (existing) throw new Error("There is already a department with that name.")

  await prisma.$transaction(async (tx) => {
    await tx.department.create({ data: { orgId, name: trimmed } })
    await record(tx, {
      orgId,
      actorId,
      targetId: null,
      action: "department.created",
      summary: `Created the ${trimmed} department`,
    })
  })

  revalidatePath("/team")
}

/** Used by the page to decide whether to offer self-editing controls. */
export async function currentMembershipId(): Promise<string | null> {
  const viewer = await getViewer()
  return viewer.membershipId
}
