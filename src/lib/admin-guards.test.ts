import { describe, expect, it } from "vitest"

import { canChangeRole, canRestore, canSuspend, type AdminTarget } from "./admin-guards"

const ADMIN = { id: "admin-1" }

const target = (o: Partial<AdminTarget> = {}): AdminTarget => ({
  id: "user-1",
  role: "USER",
  status: "ACTIVE",
  isBootstrapAdmin: false,
  ...o,
})

// Every deny here is a lockout or privilege-escalation bug that would only
// show up in production, on a live customer account.

describe("canSuspend", () => {
  it("allows suspending an ordinary active user", () => {
    expect(canSuspend(ADMIN, target()).ok).toBe(true)
  })

  it("refuses to let an admin suspend themselves", () => {
    expect(canSuspend(ADMIN, target({ id: ADMIN.id })).ok).toBe(false)
  })

  it("refuses to suspend a super admin directly", () => {
    // Must be demoted first, so it is two separately audited steps.
    const r = canSuspend(ADMIN, target({ role: "SUPER_ADMIN" }))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/demote/i)
  })

  it("refuses to suspend the bootstrap account", () => {
    // It would self-heal on next login, so blocking is the honest answer.
    const r = canSuspend(ADMIN, target({ isBootstrapAdmin: true }))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/bootstrap/i)
  })

  it("refuses to suspend an already-suspended account", () => {
    expect(canSuspend(ADMIN, target({ status: "SUSPENDED" })).ok).toBe(false)
  })

  it("puts the self-check ahead of every other rule", () => {
    // An admin acting on themselves must be refused for that reason, not
    // incidentally caught by a later branch.
    const r = canSuspend(ADMIN, target({ id: ADMIN.id, role: "SUPER_ADMIN", isBootstrapAdmin: true }))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/your own account/i)
  })
})

describe("canRestore", () => {
  it("allows restoring a suspended account", () => {
    expect(canRestore(ADMIN, target({ status: "SUSPENDED" })).ok).toBe(true)
  })

  it("refuses to restore an active account", () => {
    expect(canRestore(ADMIN, target()).ok).toBe(false)
  })
})

describe("canChangeRole", () => {
  it("promotes an active user", () => {
    expect(canChangeRole(ADMIN, target(), "SUPER_ADMIN", 1).ok).toBe(true)
  })

  it("demotes a super admin while others remain", () => {
    expect(canChangeRole(ADMIN, target({ role: "SUPER_ADMIN" }), "USER", 2).ok).toBe(true)
  })

  it("refuses to demote the last active super admin", () => {
    // The whole product becomes unadministrable otherwise.
    const r = canChangeRole(ADMIN, target({ role: "SUPER_ADMIN" }), "USER", 1)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/last active super admin/i)
  })

  it("refuses to let an admin change their own role", () => {
    expect(canChangeRole(ADMIN, target({ id: ADMIN.id }), "USER", 5).ok).toBe(false)
  })

  it("refuses to change the bootstrap account's role", () => {
    expect(canChangeRole(ADMIN, target({ isBootstrapAdmin: true }), "USER", 5).ok).toBe(false)
  })

  it("refuses to promote a suspended account", () => {
    // Otherwise suspension could be bypassed by promoting instead of restoring.
    const r = canChangeRole(ADMIN, target({ status: "SUSPENDED" }), "SUPER_ADMIN", 2)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/restore/i)
  })

  it("refuses a no-op role change", () => {
    expect(canChangeRole(ADMIN, target({ role: "USER" }), "USER", 2).ok).toBe(false)
  })

  it("never allows demoting the last super admin, whatever else is true", () => {
    for (const status of ["ACTIVE", "SUSPENDED"] as const) {
      expect(canChangeRole(ADMIN, target({ role: "SUPER_ADMIN", status }), "USER", 1).ok).toBe(false)
      expect(canChangeRole(ADMIN, target({ role: "SUPER_ADMIN", status }), "USER", 0).ok).toBe(false)
    }
  })
})
