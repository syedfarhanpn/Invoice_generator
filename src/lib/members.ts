import type { MemberRole } from "@prisma/client"

import prisma from "@/lib/db"
import { displayNameFor, memberInitials } from "@/lib/member-names"

export { displayNameFor, memberInitials }
export type { NameSource } from "@/lib/member-names"

/**
 * Who is in the workspace, for assignment controls.
 *
 * Assignment points at a Membership rather than a User, because belonging to
 * this workspace is what makes someone assignable. Removing a member unassigns
 * their work (the foreign keys are SET NULL) rather than deleting it.
 */

export type WorkspaceMember = {
  /** The Membership id - what assignedToId, managerId and assigneeId hold. */
  id: string
  name: string
  email: string
  role: MemberRole
  initials: string
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project manager",
  SALES_EXECUTIVE: "Sales executive",
  DEVELOPER: "Developer",
  SUPPORT_EXECUTIVE: "Support executive",
  ACCOUNTANT: "Accountant",
  CONTENT_CREATOR: "Content creator",
}

export async function getWorkspaceMembers(orgId: string | null): Promise<WorkspaceMember[]> {
  // No workspace means nobody to assign to - an empty list rather than a throw,
  // so the control renders as "Unassigned" and nothing breaks.
  if (!orgId) return []

  // The shell falls back to BusinessProfile.ownerName when User.name is
  // empty, so this does too. Without it the header reads "Syed Farhan PN"
  // while the assignment dropdown reads "syedfarhanpn" for the same person.
  const members = await prisma.membership.findMany({
    where: { orgId, status: { not: "SUSPENDED" } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      title: true,
      user: {
        select: {
          email: true,
          name: true,
          businessProfile: { select: { ownerName: true } },
        },
      },
    },
  })

  return members.map((member) => {
    const name = displayNameFor(member.user)
    return {
      id: member.id,
      name,
      email: member.user.email,
      role: member.role,
      initials: memberInitials(name),
    }
  })
}

/**
 * Validates an assignment target before it is written.
 *
 * Returns the membership id when it belongs to a workspace this user is in,
 * null for "unassigned", and throws otherwise. Trusting the posted value
 * would let one workspace assign work to a member of another - the id is
 * client-supplied, so it proves nothing on its own.
 */
export async function resolveAssignee(
  userId: string,
  membershipId: string | null | undefined
): Promise<string | null> {
  if (!membershipId) return null

  const member = await prisma.membership.findFirst({
    where: {
      id: membershipId,
      status: { not: "SUSPENDED" },
      org: { members: { some: { userId } } },
    },
    select: { id: true },
  })
  if (!member) throw new Error("That person is not in this workspace.")
  return member.id
}

/**
 * The workspace a new row should join.
 *
 * Every create path calls this so a record written after the workspace
 * migration is part of the workspace. Rows created without it still belong to
 * their user and still display today, but they would fall out of sight the
 * moment queries move from userId to orgId scoping.
 *
 * Returns null when the user is in no workspace, which is a valid state and
 * leaves the column nullable as the schema allows.
 */
export async function currentOrgId(userId: string): Promise<string | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId, status: { in: ["ACTIVE", "INVITED"] } },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  })
  return membership?.orgId ?? null
}
