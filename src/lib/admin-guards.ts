import type { AccountStatus, Role } from "@prisma/client"

/**
 * Rules for what a super admin may do to an account.
 *
 * Deliberately pure and free of database access so every branch is unit
 * tested: these are the checks that stop an operator from locking themselves
 * — or everyone — out of the product. The server actions in
 * src/app/dashboard/admin/actions.ts call these before any write, and the
 * database is read inside the same transaction so the counts cannot go stale.
 */

export type AdminActor = { id: string }

export type AdminTarget = {
  id: string
  role: Role
  status: AccountStatus
  /** True when this is the SUPER_ADMIN_EMAIL account. */
  isBootstrapAdmin: boolean
}

export type GuardResult = { ok: true } | { ok: false; reason: string }

const allow: GuardResult = { ok: true }
const deny = (reason: string): GuardResult => ({ ok: false, reason })

/**
 * The bootstrap account self-heals to SUPER_ADMIN/ACTIVE on its next login
 * (see current-user.ts), so any change to it would silently revert. Refusing
 * up front is honest; letting it through would look like a bug.
 */
function guardBootstrap(target: AdminTarget): GuardResult | null {
  if (!target.isBootstrapAdmin) return null
  return deny(
    "This is the bootstrap administrator account (SUPER_ADMIN_EMAIL). It is restored on every login, so it cannot be changed here — change the environment variable instead."
  )
}

export function canSuspend(actor: AdminActor, target: AdminTarget): GuardResult {
  if (target.id === actor.id) return deny("You cannot suspend your own account.")
  const bootstrap = guardBootstrap(target)
  if (bootstrap) return bootstrap
  if (target.status === "SUSPENDED") return deny("This account is already suspended.")
  if (target.role === "SUPER_ADMIN") {
    // Forcing demote-then-suspend keeps it a two-step, separately audited
    // action, and stops two super admins from suspending each other in a race.
    return deny("Demote this super admin to a user before suspending the account.")
  }
  return allow
}

export function canRestore(_actor: AdminActor, target: AdminTarget): GuardResult {
  if (target.status !== "SUSPENDED") return deny("This account is not suspended.")
  return allow
}

export function canChangeRole(
  actor: AdminActor,
  target: AdminTarget,
  newRole: Role,
  /** Active super admins currently in the system, counted in the same transaction. */
  activeSuperAdminCount: number
): GuardResult {
  if (target.id === actor.id) return deny("You cannot change your own role.")
  const bootstrap = guardBootstrap(target)
  if (bootstrap) return bootstrap
  if (target.role === newRole) return deny("This account already has that role.")

  if (newRole === "SUPER_ADMIN" && target.status === "SUSPENDED") {
    return deny("Restore this account before promoting it.")
  }

  if (target.role === "SUPER_ADMIN" && newRole === "USER" && activeSuperAdminCount <= 1) {
    return deny("This is the last active super admin — promote someone else first.")
  }

  return allow
}
