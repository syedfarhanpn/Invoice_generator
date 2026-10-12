import { describe, expect, it } from "vitest"

import {
  can,
  describeMatrix,
  MODULES,
  parseAccess,
  parseModule,
  resolveAccess,
  resolveMatrix,
  ROLE_DEFAULTS,
  satisfies,
  visibleModules,
  type PermissionContext,
} from "./permissions"

function context(partial: Partial<PermissionContext> = {}): PermissionContext {
  return { role: "DEVELOPER", status: "ACTIVE", ...partial }
}

describe("satisfies", () => {
  it("lets write stand in for read", () => {
    // A role that may edit invoices but not look at them is a bug.
    expect(satisfies("write", "read")).toBe(true)
    expect(satisfies("write", "write")).toBe(true)
    expect(satisfies("read", "read")).toBe(true)
  })

  it("does not let read stand in for write", () => {
    expect(satisfies("read", "write")).toBe(false)
    expect(satisfies("none", "read")).toBe(false)
    expect(satisfies("none", "write")).toBe(false)
  })
})

describe("the owner is never locked out", () => {
  it("has write everywhere", () => {
    const owner = context({ role: "OWNER" })
    for (const moduleKey of MODULES) {
      expect(resolveAccess(owner, moduleKey)).toBe("write")
    }
  })

  it("cannot be reduced by a role override", () => {
    const owner = context({
      role: "OWNER",
      roleOverrides: { settings: "none", team: "none" },
    })
    expect(can(owner, "settings", "write")).toBe(true)
    expect(can(owner, "team", "write")).toBe(true)
  })

  it("cannot be reduced by a member override either", () => {
    const owner = context({ role: "OWNER", memberOverrides: { team: "none" } })
    expect(can(owner, "team", "write")).toBe(true)
  })

  it("keeps access even if their membership is somehow not active", () => {
    // Belt and braces: the owner row should never be suspended, but if it
    // were, locking the workspace's owner out of it helps nobody.
    expect(can(context({ role: "OWNER", status: "SUSPENDED" }), "settings", "write")).toBe(true)
  })
})

describe("an inactive membership has no access", () => {
  it("loses everything when suspended, whatever the role", () => {
    const suspended = context({ role: "ADMIN", status: "SUSPENDED" })
    for (const moduleKey of MODULES) {
      expect(resolveAccess(suspended, moduleKey)).toBe("none")
    }
  })

  it("has nothing while merely invited", () => {
    // An invitation is not an account yet.
    expect(can(context({ role: "ADMIN", status: "INVITED" }), "clients", "read")).toBe(false)
  })

  it("has everything the role grants the moment the invitation is accepted", () => {
    // The counterpart to the rule above, and the reason getViewer() flips
    // INVITED to ACTIVE on first sign-in: without that step an invited Admin
    // stays at "No access" forever, because nothing else ever moves them.
    const accepted = context({ role: "ADMIN", status: "ACTIVE" })
    for (const moduleKey of MODULES) {
      expect(resolveAccess(accepted, moduleKey)).toBe("write")
    }
  })

  it("cannot be re-granted access by an override", () => {
    const suspended = context({
      role: "DEVELOPER",
      status: "SUSPENDED",
      memberOverrides: { settings: "write" },
    })
    expect(can(suspended, "settings", "read")).toBe(false)
  })
})

describe("defaults", () => {
  it("gives an admin everything", () => {
    const admin = context({ role: "ADMIN" })
    for (const moduleKey of MODULES) {
      expect(can(admin, moduleKey, "write")).toBe(true)
    }
  })

  it("keeps a sales executive out of expenses and settings", () => {
    const sales = context({ role: "SALES_EXECUTIVE" })
    expect(can(sales, "sales", "write")).toBe(true)
    expect(can(sales, "clients", "write")).toBe(true)
    expect(can(sales, "expenses", "read")).toBe(false)
    expect(can(sales, "settings", "read")).toBe(false)
    expect(can(sales, "team", "read")).toBe(false)
  })

  it("keeps a developer out of money and clients", () => {
    const dev = context({ role: "DEVELOPER" })
    expect(can(dev, "projects", "write")).toBe(true)
    expect(can(dev, "tasks", "write")).toBe(true)
    expect(can(dev, "documents", "read")).toBe(false)
    expect(can(dev, "expenses", "read")).toBe(false)
    expect(can(dev, "clients", "read")).toBe(false)
  })

  it("gives an accountant the money and not the pipeline", () => {
    const accountant = context({ role: "ACCOUNTANT" })
    expect(can(accountant, "documents", "write")).toBe(true)
    expect(can(accountant, "expenses", "write")).toBe(true)
    expect(can(accountant, "sales", "read")).toBe(false)
  })

  it("gives a support executive tickets and no more than a look at clients", () => {
    const support = context({ role: "SUPPORT_EXECUTIVE" })
    expect(can(support, "tickets", "write")).toBe(true)
    expect(can(support, "clients", "read")).toBe(true)
    expect(can(support, "clients", "write")).toBe(false)
  })

  it("lets nobody but an owner or admin near Team Management by default", () => {
    // The module that can grant every other permission.
    for (const role of ["PROJECT_MANAGER", "SALES_EXECUTIVE", "DEVELOPER", "SUPPORT_EXECUTIVE", "ACCOUNTANT", "CONTENT_CREATOR"] as const) {
      expect(can(context({ role }), "team", "read")).toBe(false)
      expect(can(context({ role }), "settings", "read")).toBe(false)
    }
  })

  it("defaults closed - every role grants only what is listed", () => {
    // A permission system that defaults open is not one.
    for (const [role, grants] of Object.entries(ROLE_DEFAULTS)) {
      if (role === "OWNER" || role === "ADMIN") continue
      const granted = MODULES.filter((m) => grants[m] !== "none")
      expect(granted.length).toBeLessThan(MODULES.length)
    }
  })
})

describe("overrides", () => {
  it("lets a workspace widen a role", () => {
    const dev = context({ role: "DEVELOPER", roleOverrides: { documents: "read" } })
    expect(can(dev, "documents", "read")).toBe(true)
    expect(can(dev, "documents", "write")).toBe(false)
  })

  it("lets a workspace narrow a role", () => {
    const sales = context({ role: "SALES_EXECUTIVE", roleOverrides: { clients: "read" } })
    expect(can(sales, "clients", "write")).toBe(false)
    expect(can(sales, "clients", "read")).toBe(true)
  })

  it("lets one person differ from their role", () => {
    const dev = context({ role: "DEVELOPER", memberOverrides: { expenses: "write" } })
    expect(can(dev, "expenses", "write")).toBe(true)
    // Everyone else with that role is unaffected.
    expect(can(context({ role: "DEVELOPER" }), "expenses", "read")).toBe(false)
  })

  it("prefers the member override over the role override", () => {
    const dev = context({
      role: "DEVELOPER",
      roleOverrides: { tickets: "none" },
      memberOverrides: { tickets: "write" },
    })
    expect(resolveAccess(dev, "tickets")).toBe("write")
  })

  it("leaves modules the override does not mention alone", () => {
    const dev = context({ role: "DEVELOPER", memberOverrides: { expenses: "write" } })
    expect(can(dev, "projects", "write")).toBe(true)
  })

  it("treats a revoking override as revoking, not as absent", () => {
    // "none" is a decision, and must not fall through to the default.
    const admin = context({ role: "ADMIN", memberOverrides: { settings: "none" } })
    expect(can(admin, "settings", "read")).toBe(false)
  })
})

describe("resolveMatrix and visibleModules", () => {
  it("returns an entry for every module", () => {
    expect(Object.keys(resolveMatrix(context())).sort()).toEqual([...MODULES].sort())
  })

  it("lists only what a member can reach", () => {
    const visible = visibleModules(context({ role: "DEVELOPER" }))
    expect(visible).toContain("projects")
    expect(visible).toContain("tasks")
    expect(visible).not.toContain("settings")
    expect(visible).not.toContain("expenses")
  })

  it("gives a suspended member nothing to see", () => {
    expect(visibleModules(context({ role: "ADMIN", status: "SUSPENDED" }))).toEqual([])
  })
})

describe("describeMatrix", () => {
  it("says full access when everything is editable", () => {
    expect(describeMatrix(resolveMatrix(context({ role: "ADMIN" })))).toBe("Full access")
  })

  it("says no access when nothing is", () => {
    expect(describeMatrix(resolveMatrix(context({ status: "SUSPENDED" })))).toBe("No access")
  })

  it("counts rather than listing thirteen module names", () => {
    const summary = describeMatrix(resolveMatrix(context({ role: "SUPPORT_EXECUTIVE" })))
    expect(summary).toMatch(/editable/)
    expect(summary).toMatch(/view-only/)
  })
})

describe("parsing untrusted values", () => {
  it("accepts the real ones", () => {
    expect(parseAccess("write")).toBe("write")
    expect(parseModule("expenses")).toBe("expenses")
  })

  it("rejects anything else rather than coercing it", () => {
    expect(parseAccess("admin")).toBeNull()
    expect(parseAccess("")).toBeNull()
    expect(parseAccess(undefined)).toBeNull()
    expect(parseAccess(true)).toBeNull()
    expect(parseModule("../../etc")).toBeNull()
    expect(parseModule("Settings")).toBeNull()
  })
})
