import { cache } from "react"
import { redirect } from "next/navigation"
import type { MemberRole, MemberStatus, PermissionAccess } from "@prisma/client"

import { getCurrentUser, isSuperAdmin } from "@/lib/current-user"
import prisma from "@/lib/db"
import { viewingOrgId } from "@/lib/viewing"
import { VIEWING_READ_ONLY_MESSAGE } from "@/lib/viewing-rules"
import {
  can,
  isAdminRole,
  parseAccess,
  parseModule,
  resolveMatrix,
  type Access,
  type Module,
  type PermissionContext,
} from "@/lib/permissions"

/**
 * The server-side gate.
 *
 * src/lib/permissions.ts says what a role MAY do; this says no. Every page,
 * Server Action and route handler that touches a module calls through here,
 * because hiding a nav item stops nobody who can type a URL.
 *
 * It fails closed in every direction that matters:
 *
 *  - No membership at all means no access. A user row without one is somebody
 *    who was never admitted to this workspace, not an unrestricted visitor.
 *  - An unreadable stored grant (a module name the product no longer has, an
 *    access level that is not one) is ignored rather than guessed at.
 *  - requirePermission REDIRECTS rather than returning false, so forgetting to
 *    check the result cannot leave a page rendering.
 *
 * The super admin is deliberately NOT short-circuited here: being the platform
 * admin does not by itself put you inside any company. The one way in is
 * viewing - opened from the Accounts console, recorded in the admin audit
 * trail, and read-only. While a company is being viewed, getViewer() answers
 * as that company with every module capped at "read", so each check below
 * refuses writes the way it would for any view-only member, and the database
 * client refuses them again underneath (src/lib/db.ts).
 */

export type Viewer = {
  userId: string
  email: string
  /** Null when this user belongs to no workspace. */
  membershipId: string | null
  orgId: string | null
  role: MemberRole | null
  /** Exposed so getWorkspaceIdentity() can reuse this read rather than
   *  issuing a second one for the same row. */
  status: MemberStatus | null
  context: PermissionContext | null
  /**
   * Set while the platform admin is viewing a company. They hold no
   * membership in it, so membershipId and role stay null: nothing can be
   * assigned to them and nothing is recorded against a member.
   */
  viewing: { orgId: string; orgName: string } | null
}

/**
 * The platform admin's view of a company: everything an administrator can
 * see, capped at read. ADMIN rather than OWNER only so the starting matrix is
 * "all modules" - readOnly then takes every one of them down to "read".
 */
const VIEWING_CONTEXT: PermissionContext = { role: "ADMIN", status: "ACTIVE", readOnly: true }

/** The stored enum, as the pure permission model names it. */
export const ACCESS_FROM_DB: Record<PermissionAccess, Access> = {
  NONE: "none",
  READ: "read",
  WRITE: "write",
}

export const ACCESS_TO_DB: Record<Access, PermissionAccess> = {
  none: "NONE",
  read: "READ",
  write: "WRITE",
}

/**
 * Who is asking, and what they may do.
 *
 * Cached per request: a page that checks three modules and then renders a nav
 * from the same context should not read the grant table four times.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  const user = await getCurrentUser()

  // Honoured for a super admin only. Anyone else holding the cookie is
  // treated exactly as they would be without it.
  if (isSuperAdmin(user)) {
    const viewingId = await viewingOrgId()
    const org = viewingId
      ? await prisma.organisation.findUnique({ where: { id: viewingId }, select: { id: true, name: true } })
      : null

    if (org) {
      return {
        userId: user.id,
        email: user.email,
        membershipId: null,
        orgId: org.id,
        role: null,
        status: "ACTIVE",
        context: VIEWING_CONTEXT,
        viewing: { orgId: org.id, orgName: org.name },
      }
    }
  }

  let membership = await prisma.membership.findFirst({
    where: { userId: user.id, status: { in: ["ACTIVE", "INVITED", "SUSPENDED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, orgId: true, role: true, status: true },
  })

  /**
   * Signing in with an invited address IS accepting the invitation.
   *
   * resolveAccess() grants nothing to anyone who is not ACTIVE, which is what
   * makes suspending someone actually stop them. The side effect was that an
   * INVITED member had no access to anything however generous their role, and
   * nothing ever moved them on: Suspend / Reinstate is deliberately hidden
   * for invitees, so ACTIVE was a state no path could reach.
   *
   * Done here rather than in getCurrentUser() because the membership and its
   * status have just been read anyway - so the common case costs nothing, and
   * the write only fires on the one request where it is true.
   *
   * Scoped to INVITED. A SUSPENDED membership stays suspended; letting a
   * sign-in clear it would mean anyone shut out could restore themselves by
   * signing in again.
   */
  if (membership?.status === "INVITED") {
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: "ACTIVE", joinedAt: new Date() },
    })
    membership = { ...membership, status: "ACTIVE" }
  }

  if (!membership) {
    return {
      userId: user.id,
      email: user.email,
      membershipId: null,
      orgId: null,
      role: null,
      status: null,
      context: null,
      viewing: null,
    }
  }

  const grants = await prisma.permissionGrant.findMany({
    where: {
      orgId: membership.orgId,
      OR: [{ role: membership.role }, { membershipId: membership.id }],
    },
    select: { role: true, membershipId: true, module: true, access: true },
  })

  const roleOverrides: Partial<Record<Module, Access>> = {}
  const memberOverrides: Partial<Record<Module, Access>> = {}

  for (const grant of grants) {
    // A module the product no longer has, or a level that is not one, is
    // dropped rather than guessed at.
    const moduleKey = parseModule(grant.module)
    const access = parseAccess(ACCESS_FROM_DB[grant.access])
    if (!moduleKey || !access) continue

    if (grant.membershipId) memberOverrides[moduleKey] = access
    else roleOverrides[moduleKey] = access
  }

  return {
    userId: user.id,
    email: user.email,
    membershipId: membership.id,
    orgId: membership.orgId,
    role: membership.role,
    status: membership.status,
    context: {
      role: membership.role,
      status: membership.status,
      roleOverrides,
      memberOverrides,
    },
    viewing: null,
  }
})

/** Whether the current viewer may do `required` to `module`. Never throws. */
export async function hasPermission(module: Module, required: Access): Promise<boolean> {
  const viewer = await getViewer()
  // No membership, no access - see the note at the top.
  if (!viewer.context) return false
  return can(viewer.context, module, required)
}

/**
 * Refuses by redirecting, and returns the viewer when it lets you through.
 *
 * Redirects rather than returning a boolean on purpose: a caller that forgets
 * to branch on a boolean renders the page anyway, and that failure mode is
 * silent. This one cannot be ignored.
 */
export async function requirePermission(module: Module, required: Access): Promise<Viewer> {
  const viewer = await getViewer()

  if (!viewer.context) {
    redirect(await noWorkspaceHome())
  }
  if (!can(viewer.context, module, required)) {
    redirect(`/denied?module=${encodeURIComponent(module)}`)
  }

  return viewer
}

/**
 * Where someone with no company to work in belongs.
 *
 * The platform admin belongs to no company by design, so for them this is
 * not a dead end: their home is the Accounts console, where the companies
 * are. Anyone else has simply not been added to a team yet.
 */
export async function noWorkspaceHome(): Promise<string> {
  return isSuperAdmin(await getCurrentUser()) ? "/dashboard/admin" : "/no-workspace"
}

/**
 * The same check for Server Actions and route handlers, which must not
 * redirect - a redirect from an action is reported to the user as a
 * navigation rather than as a refusal, and a route handler would answer a
 * data request with an HTML page.
 */
export async function assertPermission(module: Module, required: Access): Promise<Viewer> {
  const viewer = await getViewer()

  if (!viewer.context || !can(viewer.context, module, required)) {
    // Some screens offer their buttons to everyone and leave the refusal to
    // here. While viewing, "no permission" would be the wrong explanation.
    throw new Error(viewer.viewing ? VIEWING_READ_ONLY_MESSAGE : "You do not have permission to do that.")
  }

  return viewer
}

/**
 * Whether the viewer administers this workspace. Never throws.
 *
 * For rendering: a destructive control is not offered to someone who may not
 * use it. The refusal itself is assertWorkspaceAdmin() below - this only
 * decides what to draw.
 */
export async function isWorkspaceAdmin(): Promise<boolean> {
  const viewer = await getViewer()
  return isAdminRole(viewer.role, viewer.status)
}

/**
 * The gate for an irreversible act, for Server Actions.
 *
 * Separate from assertPermission() rather than folded into it, because the
 * two answer different questions: "may you work in Clients" and "may you
 * destroy one". Callers pass through BOTH - the module grant can still be
 * taken away from an administrator, and an override that says so should be
 * honoured.
 */
export async function assertWorkspaceAdmin(): Promise<Viewer> {
  const viewer = await getViewer()

  if (!isAdminRole(viewer.role, viewer.status)) {
    throw new Error(viewer.viewing ? VIEWING_READ_ONLY_MESSAGE : "Only a workspace owner or admin can do that.")
  }

  return viewer
}

/** The full matrix for the current viewer, for rendering their nav. */
export async function viewerMatrix(): Promise<Record<Module, Access> | null> {
  const viewer = await getViewer()
  return viewer.context ? resolveMatrix(viewer.context) : null
}
