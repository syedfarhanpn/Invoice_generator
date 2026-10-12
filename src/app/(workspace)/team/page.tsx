import type { MemberRole } from "@prisma/client"

import { PageHeader } from "@/components/app/page-header"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { ACCESS_FROM_DB, getViewer, hasPermission, requirePermission } from "@/lib/access"
import { formatLocalTime, formatShortDay } from "@/lib/dates"
import prisma from "@/lib/db"
import { displayNameFor, memberInitials } from "@/lib/member-names"
import { ROLE_LABEL } from "@/lib/members"
import {
  describeMatrix,
  parseAccess,
  parseModule,
  resolveMatrix,
  type Access,
  type Module,
} from "@/lib/permissions"

import { TeamView, type ActivityRow, type MemberRow, type Option, type RoleRow } from "./team-view"

export const metadata = { title: "Team Management" }

/** Everything a workspace can hand out. OWNER is not assignable. */
const ASSIGNABLE: MemberRole[] = [
  "ADMIN",
  "PROJECT_MANAGER",
  "SALES_EXECUTIVE",
  "DEVELOPER",
  "SUPPORT_EXECUTIVE",
  "ACCOUNTANT",
  "CONTENT_CREATOR",
]

/**
 * Team Management.
 *
 * The single place for people, roles, departments, permissions and the record
 * of who changed them. Settings deliberately holds none of this.
 *
 * The matrices shown are resolved by the same src/lib/permissions.ts code the
 * server gates with, so what this screen says someone can reach is what they
 * can actually reach - rather than a second description of the rules that
 * could drift away from the first.
 */
export default async function TeamPage() {
  await requirePermission("team", "read")

  const [viewer, canEdit] = await Promise.all([getViewer(), hasPermission("team", "write")])
  if (!viewer.orgId) {
    // requirePermission already sends a memberless user to /no-workspace;
    // this is the type narrowing, not a second gate.
    return null
  }
  const orgId = viewer.orgId

  const [memberships, departments, grants, logs] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        status: true,
        title: true,
        departmentId: true,
        joinedAt: true,
        lastActiveAt: true,
        department: { select: { name: true } },
        user: {
          select: { name: true, email: true, businessProfile: { select: { ownerName: true } } },
        },
      },
    }),
    prisma.department.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.permissionGrant.findMany({
      where: { orgId },
      select: { role: true, membershipId: true, module: true, access: true },
    }),
    prisma.memberAuditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        summary: true,
        createdAt: true,
        actor: {
          select: {
            user: { select: { name: true, email: true, businessProfile: { select: { ownerName: true } } } },
          },
        },
      },
    }),
  ])

  // Grants, sorted into the two shapes resolveMatrix expects. An unreadable
  // row is dropped rather than guessed at - the same rule the gate applies.
  const roleOverrides = new Map<MemberRole, Partial<Record<Module, Access>>>()
  const memberOverrides = new Map<string, Partial<Record<Module, Access>>>()

  for (const grant of grants) {
    const moduleKey = parseModule(grant.module)
    const access = parseAccess(ACCESS_FROM_DB[grant.access])
    if (!moduleKey || !access) continue

    if (grant.membershipId) {
      const entry = memberOverrides.get(grant.membershipId) ?? {}
      entry[moduleKey] = access
      memberOverrides.set(grant.membershipId, entry)
    } else if (grant.role) {
      const entry = roleOverrides.get(grant.role) ?? {}
      entry[moduleKey] = access
      roleOverrides.set(grant.role, entry)
    }
  }

  const members: MemberRow[] = memberships.map((membership) => {
    const name = displayNameFor(membership.user)
    const overrides = memberOverrides.get(membership.id) ?? {}
    /**
     * What their configuration grants - deliberately not what the gate would
     * return for them today.
     *
     * resolveAccess() gives nothing to anyone who is not ACTIVE, which is
     * correct where it matters: an invited or suspended person must actually
     * be stopped. But reading that straight into this column means an admin
     * who has just set someone's permissions sees "No access" the instant
     * they save, which looks exactly like the save failed. It did not; the
     * grants are stored and will apply the moment the person accepts.
     *
     * So this column answers "what have I given them" and the Status column
     * beside it answers "can they use it yet". The row spells out the
     * difference for anyone not yet active, rather than leaving the reader to
     * reconcile two columns.
     */
    const matrix = resolveMatrix({
      role: membership.role,
      status: "ACTIVE",
      roleOverrides: roleOverrides.get(membership.role),
      memberOverrides: overrides,
    })

    return {
      id: membership.id,
      name,
      email: membership.user.email,
      initials: memberInitials(name),
      role: membership.role,
      roleLabel: ROLE_LABEL[membership.role],
      status: membership.status,
      departmentId: membership.departmentId,
      departmentName: membership.department?.name ?? null,
      title: membership.title,
      lastActiveLabel: membership.lastActiveAt ? formatShortDay(membership.lastActiveAt) : null,
      joinedLabel: membership.joinedAt ? formatShortDay(membership.joinedAt) : null,
      summary: describeMatrix(matrix),
      matrix,
      overrides,
      isOwner: membership.role === "OWNER",
      isSelf: membership.id === viewer.membershipId,
    }
  })

  const roles: RoleRow[] = (["OWNER", ...ASSIGNABLE] as MemberRole[]).map((role) => {
    const overrides = roleOverrides.get(role) ?? {}
    const matrix = resolveMatrix({ role, status: "ACTIVE", roleOverrides: overrides })
    return {
      role,
      label: ROLE_LABEL[role],
      members: memberships.filter((m) => m.role === role).length,
      summary: describeMatrix(matrix),
      matrix,
      overrides,
    }
  })

  const activity: ActivityRow[] = logs.map((log) => ({
    id: log.id,
    summary: log.summary,
    actorName: log.actor ? displayNameFor(log.actor.user) : null,
    whenLabel: `${formatShortDay(log.createdAt)}, ${formatLocalTime(log.createdAt)}`,
  }))

  const departmentOptions: Option[] = departments.map((d) => ({ id: d.id, label: d.name }))
  const roleOptions: Option[] = ASSIGNABLE.map((role) => ({ id: role, label: ROLE_LABEL[role] }))

  const active = members.filter((m) => m.status === "ACTIVE").length
  const admins = members.filter(
    (m) => (m.role === "ADMIN" || m.role === "OWNER") && m.status === "ACTIVE"
  ).length

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader title="Team Management" trail={[{ label: "Team Management" }]} />

      <StatRow>
        <StatCard label="Members" value={members.length} format="integer" icon="clients" animate={false} hint={`${active} active`} />
        <StatCard
          label="Administrators"
          value={admins}
          format="integer"
          icon="done"
          animate={false}
          delta={
            admins === 1
              ? { label: "only one", direction: "flat", inverted: true, caption: "promote a second" }
              : { label: "can manage the team", direction: "flat" }
          }
        />
        <StatCard
          label="Departments"
          value={departments.length}
          format="integer"
          icon="projects"
          animate={false}
          hint={departments.length === 0 ? "none yet" : "for people and overhead"}
        />
        <StatCard
          label="Awaiting first sign-in"
          value={members.filter((m) => m.status === "INVITED").length}
          format="integer"
          icon="due"
          animate={false}
          hint="invited, not yet joined"
        />
      </StatRow>

      {!canEdit && (
        <p className="rounded-lg border bg-card px-4 py-3 text-xs text-muted-foreground">
          You can see the team but not change it. Roles, permissions and departments are read-only
          for your role.
        </p>
      )}

      <TeamView
        members={members}
        roles={roles}
        activity={activity}
        departments={departmentOptions}
        assignableRoles={roleOptions}
        canEdit={canEdit}
      />
    </div>
  )
}
