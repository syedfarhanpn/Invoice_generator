import { cache } from "react"
import { redirect } from "next/navigation"
import type { MemberRole, MemberStatus, PermissionAccess } from "@prisma/client"

import { getCurrentUser } from "@/lib/current-user"
import prisma from "@/lib/db"
import {
  can,
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
 * The super admin is deliberately NOT short-circuited here. They operate the
 * product and administer accounts; that is not the same as being entitled to
 * read a tenant's commercial records, and src/app/dashboard/admin is where
 * their powers live.
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
}

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
    redirect("/no-workspace")
  }
  if (!can(viewer.context, module, required)) {
    redirect(`/denied?module=${encodeURIComponent(module)}`)
  }

  return viewer
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
    throw new Error("You do not have permission to do that.")
  }

  return viewer
}

/** The full matrix for the current viewer, for rendering their nav. */
export async function viewerMatrix(): Promise<Record<Module, Access> | null> {
  const viewer = await getViewer()
  return viewer.context ? resolveMatrix(viewer.context) : null
}
