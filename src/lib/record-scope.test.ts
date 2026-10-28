import { describe, expect, it } from "vitest"

import {
  clientScopeFilter,
  dealScopeFilter,
  documentScopeFilter,
  projectScopeFilter,
  seesAllRecords,
  withScope,
  type RecordScope,
} from "@/lib/record-scope"

const MEMBER = "membership-shyam"

function scope(overrides: Partial<RecordScope> = {}): RecordScope {
  return { membershipId: MEMBER, restrictedToOwn: false, ...overrides }
}

describe("seesAllRecords", () => {
  it("is the default, so nobody loses sight of anything by accident", () => {
    expect(seesAllRecords(scope())).toBe(true)
    expect(seesAllRecords({ membershipId: null, restrictedToOwn: false })).toBe(true)
  })

  it("is false once someone is restricted", () => {
    expect(seesAllRecords(scope({ restrictedToOwn: true }))).toBe(false)
  })
})

describe("clientScopeFilter", () => {
  it("adds nothing for an unrestricted viewer", () => {
    expect(clientScopeFilter(scope())).toEqual({})
  })

  it("limits a restricted viewer to the accounts they own", () => {
    expect(clientScopeFilter(scope({ restrictedToOwn: true }))).toEqual({ ownerId: MEMBER })
  })

  it("does not hand a restricted viewer the unassigned accounts", () => {
    // ownerId: MEMBER, not "MEMBER or null" - an account nobody owns is not
    // implicitly everybody's.
    expect(clientScopeFilter(scope({ restrictedToOwn: true }))).not.toHaveProperty("OR")
  })

  it("matches nothing when restricted but unidentifiable", () => {
    // The safe reading of "only their own" when we cannot say who they are.
    expect(clientScopeFilter({ membershipId: null, restrictedToOwn: true })).toEqual({
      id: { in: [] },
    })
  })
})

describe("dealScopeFilter", () => {
  it("adds nothing for an unrestricted viewer", () => {
    expect(dealScopeFilter(scope())).toEqual({})
  })

  it("shows a restricted viewer their own leads AND the unassigned ones", () => {
    // Different from clients on purpose: an unworked lead that nobody can see
    // is how it goes stale.
    expect(dealScopeFilter(scope({ restrictedToOwn: true }))).toEqual({
      OR: [{ assignedToId: MEMBER }, { assignedToId: null }],
    })
  })
})

describe("projectScopeFilter", () => {
  it("limits a restricted viewer to projects they manage", () => {
    expect(projectScopeFilter(scope({ restrictedToOwn: true }))).toEqual({ managerId: MEMBER })
  })
})

describe("documentScopeFilter", () => {
  it("follows the client's owner, since a document carries no assignment", () => {
    expect(documentScopeFilter(scope({ restrictedToOwn: true }))).toEqual({
      client: { ownerId: MEMBER },
    })
  })
})

describe("withScope", () => {
  it("returns the original where untouched when there is no restriction", () => {
    const where = { userId: "w1", archivedAt: null }
    expect(withScope(where, {})).toBe(where)
  })

  it("ANDs the filter rather than spreading it", () => {
    const where = { userId: "w1", archivedAt: null }
    expect(withScope(where, { ownerId: MEMBER })).toEqual({
      userId: "w1",
      archivedAt: null,
      AND: [{ ownerId: MEMBER }],
    })
  })

  it("cannot overwrite a predicate the caller already set", () => {
    // The bug this guards: a scope filter replacing archivedAt: null would
    // start showing deleted records to the one person meant to see less.
    const merged = withScope({ archivedAt: null }, { archivedAt: { not: null } }) as Record<
      string,
      unknown
    >
    expect(merged.archivedAt).toBeNull()
    expect(merged.AND).toEqual([{ archivedAt: { not: null } }])
  })

  it("keeps an existing AND rather than dropping it", () => {
    const where = { userId: "w1", AND: [{ status: "ACTIVE" }] }
    expect(withScope(where, { ownerId: MEMBER })).toEqual({
      userId: "w1",
      AND: [{ status: "ACTIVE" }, { ownerId: MEMBER }],
    })
  })
})
