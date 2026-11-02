import { describe, expect, it } from "vitest"

import { allowedWhileViewing, isWriteOperation } from "./viewing-rules"

describe("isWriteOperation", () => {
  it("treats every row-changing operation as a write", () => {
    for (const op of ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]) {
      expect(isWriteOperation(op)).toBe(true)
    }
  })

  it("treats raw statements that change rows as writes", () => {
    expect(isWriteOperation("$executeRaw")).toBe(true)
    expect(isWriteOperation("$executeRawUnsafe")).toBe(true)
  })

  it("leaves reads alone, raw selects included", () => {
    for (const op of ["findMany", "findUnique", "findFirst", "count", "aggregate", "groupBy", "$queryRaw"]) {
      expect(isWriteOperation(op)).toBe(false)
    }
  })
})

describe("allowedWhileViewing", () => {
  it("lets the visit be recorded", () => {
    expect(allowedWhileViewing("AdminAuditLog", "create", { data: { action: "company.viewed" } })).toBe(true)
  })

  it("does not let the audit trail be edited or deleted", () => {
    expect(allowedWhileViewing("AdminAuditLog", "update", { data: {} })).toBe(false)
    expect(allowedWhileViewing("AdminAuditLog", "deleteMany", {})).toBe(false)
  })

  it("lets the admin's own last sign-in be refreshed", () => {
    expect(allowedWhileViewing("User", "update", { where: { id: "u" }, data: { lastLoginAt: new Date() } })).toBe(true)
  })

  it("refuses any other change to a User row, such as a numbering sequence", () => {
    expect(allowedWhileViewing("User", "update", { data: { clientSeq: 4 } })).toBe(false)
    expect(allowedWhileViewing("User", "update", { data: { lastLoginAt: new Date(), role: "USER" } })).toBe(false)
    expect(allowedWhileViewing("User", "update", { data: {} })).toBe(false)
  })

  it("refuses company records outright", () => {
    expect(allowedWhileViewing("Client", "create", { data: {} })).toBe(false)
    expect(allowedWhileViewing("Document", "update", { data: {} })).toBe(false)
    expect(allowedWhileViewing(undefined, "$executeRaw", {})).toBe(false)
  })
})
