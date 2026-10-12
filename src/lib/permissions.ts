import type { MemberRole, MemberStatus } from "@prisma/client"

/**
 * Who may see and change what.
 *
 * Until now MemberRole was a label: it appeared in a dropdown and enforced
 * nothing, so any authenticated member of a workspace could do anything. This
 * module is the rule, and src/lib/access.ts is the server-side gate that
 * applies it. Hiding a nav item is not access control and is never treated as
 * such here.
 *
 * Three rules are deliberately absolute, because each one protects against a
 * mistake that cannot be undone from inside the product:
 *
 *  1. OWNER always has full access and can never be reduced. Someone has to
 *     be able to put a broken permission matrix back, and if that person can
 *     be locked out there is no way back in short of the database.
 *  2. A membership that is not ACTIVE has no access at all, whatever its role
 *     or overrides say. Suspending someone has to actually stop them.
 *  3. "write" implies "read". A role that may edit invoices but is somehow
 *     not allowed to look at them is a bug, not a policy.
 *
 * What this does NOT do, and should not be read as doing: row-level scoping.
 * The brief's "Developer: assigned projects" is a narrower rule than anything
 * expressible here - this grants access to the Projects MODULE, not to a
 * subset of its rows. Every query would have to carry the restriction for
 * that to be real, so it is left undone rather than half-claimed.
 */

export const MODULES = [
  "sales",
  "clients",
  "projects",
  "tasks",
  "calendar",
  "documents",
  "renewals",
  "domains",
  "tickets",
  "expenses",
  "reports",
  "team",
  "settings",
] as const

export type Module = (typeof MODULES)[number]

export const MODULE_LABEL: Record<Module, string> = {
  sales: "Sales & Leads",
  clients: "Clients",
  projects: "Projects",
  tasks: "Tasks",
  calendar: "Calendar",
  documents: "Documents",
  renewals: "AMC & Renewals",
  domains: "Domains & Hosting",
  tickets: "Support Tickets",
  expenses: "Expenses",
  reports: "Reports",
  team: "Team Management",
  settings: "Settings",
}

/** Ordered, so "at least read" is a comparison rather than a lookup. */
export const ACCESS_LEVELS = ["none", "read", "write"] as const
export type Access = (typeof ACCESS_LEVELS)[number]

export const ACCESS_LABEL: Record<Access, string> = {
  none: "No access",
  read: "Can view",
  write: "Can edit",
}

function rank(access: Access): number {
  return ACCESS_LEVELS.indexOf(access)
}

/** Whether `held` satisfies `required`. "write" satisfies "read". */
export function satisfies(held: Access, required: Access): boolean {
  return rank(held) >= rank(required)
}

const ALL: Record<Module, Access> = Object.fromEntries(
  MODULES.map((m) => [m, "write" as Access])
) as Record<Module, Access>

const NONE: Record<Module, Access> = Object.fromEntries(
  MODULES.map((m) => [m, "none" as Access])
) as Record<Module, Access>

/** Builds a matrix from a short list of exceptions to "no access". */
function matrix(grants: Partial<Record<Module, Access>>): Record<Module, Access> {
  return { ...NONE, ...grants }
}

/**
 * What each role may do before anyone customises it.
 *
 * Taken from the access patterns in the brief, which were explicit that they
 * are examples rather than assumptions to impose - so these are the starting
 * point an operator edits, not a fixed policy. Everything not listed is "no
 * access": a permission system that defaults open is not one.
 */
export const ROLE_DEFAULTS: Record<MemberRole, Record<Module, Access>> = {
  // Rule 1 above. Present for completeness; never actually consulted,
  // because resolveAccess() short-circuits for an owner.
  OWNER: ALL,
  ADMIN: ALL,

  PROJECT_MANAGER: matrix({
    projects: "write",
    tasks: "write",
    calendar: "write",
    clients: "write",
    tickets: "write",
    documents: "read",
    reports: "read",
    sales: "read",
  }),

  SALES_EXECUTIVE: matrix({
    sales: "write",
    clients: "write",
    calendar: "write",
    tasks: "write",
    documents: "read",
    reports: "read",
  }),

  DEVELOPER: matrix({
    projects: "write",
    tasks: "write",
    calendar: "read",
    tickets: "write",
  }),

  SUPPORT_EXECUTIVE: matrix({
    tickets: "write",
    clients: "read",
    projects: "read",
    calendar: "read",
    tasks: "write",
  }),

  ACCOUNTANT: matrix({
    documents: "write",
    expenses: "write",
    renewals: "write",
    domains: "write",
    clients: "read",
    projects: "read",
    reports: "read",
  }),

  CONTENT_CREATOR: matrix({
    tasks: "write",
    calendar: "read",
    projects: "read",
  }),
}

/** One member's access, as it is actually decided. */
export type PermissionContext = {
  role: MemberRole
  status: MemberStatus
  /** What the workspace has set for this role, replacing the defaults. */
  roleOverrides?: Partial<Record<Module, Access>>
  /** What has been set for this one person, replacing both. */
  memberOverrides?: Partial<Record<Module, Access>>
}

/**
 * The access a member actually holds for one module.
 *
 * Order: owner wins, then inactive loses, then member override, then role
 * override, then the built-in default. Later entries are more specific, which
 * is the order a reader expects, and the two absolute rules are applied first
 * so nothing below can contradict them.
 */
export function resolveAccess(context: PermissionContext, module: Module): Access {
  // Rule 1: an owner is never locked out of their own workspace.
  if (context.role === "OWNER") return "write"

  // Rule 2: suspending someone has to actually stop them.
  if (context.status !== "ACTIVE") return "none"

  return (
    context.memberOverrides?.[module] ??
    context.roleOverrides?.[module] ??
    ROLE_DEFAULTS[context.role][module]
  )
}

/** Whether a member may do `required` to `module`. */
export function can(context: PermissionContext, module: Module, required: Access): boolean {
  if (required === "none") return true
  return satisfies(resolveAccess(context, module), required)
}

/** The whole matrix for one member, for a permission summary. */
export function resolveMatrix(context: PermissionContext): Record<Module, Access> {
  return Object.fromEntries(
    MODULES.map((module) => [module, resolveAccess(context, module)])
  ) as Record<Module, Access>
}

/** The modules a member can reach at all, for building their nav. */
export function visibleModules(context: PermissionContext): Module[] {
  return MODULES.filter((module) => can(context, module, "read"))
}

/**
 * A one-line summary of what a role can reach, for the roles table.
 *
 * Counts rather than lists: thirteen module names in a table cell is not a
 * summary of anything.
 */
export function describeMatrix(matrixed: Record<Module, Access>): string {
  const write = MODULES.filter((m) => matrixed[m] === "write").length
  const read = MODULES.filter((m) => matrixed[m] === "read").length

  if (write === MODULES.length) return "Full access"
  if (write === 0 && read === 0) return "No access"

  const parts: string[] = []
  if (write > 0) parts.push(`${write} editable`)
  if (read > 0) parts.push(`${read} view-only`)
  return parts.join(", ")
}

/** Narrows an untrusted value from a form or a database row. */
export function parseAccess(value: unknown): Access | null {
  return ACCESS_LEVELS.includes(value as Access) ? (value as Access) : null
}

export function parseModule(value: unknown): Module | null {
  return MODULES.includes(value as Module) ? (value as Module) : null
}
