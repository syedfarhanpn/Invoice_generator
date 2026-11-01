import { describe, expect, it } from "vitest"

import {
  clientDeletionWarnings,
  confirmationMatches,
  describeClientImpact,
  EMPTY_IMPACT,
  hasAttachedRecords,
  type ClientImpact,
} from "@/lib/client-deletion"

function impact(overrides: Partial<ClientImpact> = {}): ClientImpact {
  return { ...EMPTY_IMPACT, ...overrides }
}

describe("describeClientImpact", () => {
  it("says nothing when nothing is attached", () => {
    expect(describeClientImpact(EMPTY_IMPACT)).toEqual([])
  })

  it("omits the empty counts rather than listing zeroes", () => {
    const lines = describeClientImpact(impact({ projects: 2 }))
    expect(lines).toEqual(["2 projects"])
  })

  it("singularises", () => {
    expect(describeClientImpact(impact({ projects: 1 }))).toEqual(["1 project"])
    expect(describeClientImpact(impact({ tickets: 1 }))).toEqual(["1 support ticket"])
    expect(describeClientImpact(impact({ deals: 1 }))).toEqual(["1 lead"])
  })

  it("folds the issued count into the documents line instead of double-listing", () => {
    // 9 documents of which 4 are issued is nine rows, not thirteen.
    const lines = describeClientImpact(impact({ documents: 9, issuedDocuments: 4 }))
    expect(lines).toEqual(["9 documents, 4 of them issued"])
  })

  it("leaves the issued clause off when every document is a draft", () => {
    expect(describeClientImpact(impact({ documents: 3, issuedDocuments: 0 }))).toEqual([
      "3 documents",
    ])
  })

  it("lists the records a real client carries, documents first", () => {
    const lines = describeClientImpact(
      impact({
        documents: 9,
        issuedDocuments: 4,
        payments: 11,
        proposals: 2,
        projects: 3,
        tasks: 22,
        subscriptions: 2,
        tickets: 5,
        deals: 1,
        contacts: 2,
        activities: 40,
      })
    )
    expect(lines[0]).toBe("9 documents, 4 of them issued")
    expect(lines).toContain("11 payment receipts")
    expect(lines).toContain("2 proposals")
    expect(lines).toContain("2 renewals")
    expect(lines).toContain("40 logged activities")
    expect(lines).toHaveLength(10)
  })

  it("never mentions expenses, which are not deleted", () => {
    const lines = describeClientImpact(impact({ expenses: 6, projects: 1 }))
    expect(lines.join(" ")).not.toContain("expense")
  })
})

describe("hasAttachedRecords", () => {
  it("is false for a client with nothing on them", () => {
    expect(hasAttachedRecords(EMPTY_IMPACT)).toBe(false)
  })

  it("does not count surviving expenses as attached records", () => {
    // Expenses alone must not make the dialog claim records will be removed.
    expect(hasAttachedRecords(impact({ expenses: 4 }))).toBe(false)
  })

  it("is true as soon as one record hangs off them", () => {
    expect(hasAttachedRecords(impact({ contacts: 1 }))).toBe(true)
  })
})

describe("clientDeletionWarnings", () => {
  it("says nothing extra for a client with no history", () => {
    expect(clientDeletionWarnings(EMPTY_IMPACT)).toEqual([])
  })

  it("warns about the gap in invoice numbering when documents were issued", () => {
    const [first] = clientDeletionWarnings(impact({ documents: 4, issuedDocuments: 4 }))
    expect(first).toContain("4 issued documents")
    expect(first).toContain("gap in your invoice numbering")
  })

  it("stays quiet about numbering when nothing was ever issued", () => {
    const warnings = clientDeletionWarnings(impact({ documents: 3, issuedDocuments: 0 }))
    expect(warnings.join(" ")).not.toContain("numbering")
  })

  it("warns that the payment ledger goes too", () => {
    expect(clientDeletionWarnings(impact({ payments: 1 })).join(" ")).toContain("1 receipt")
  })

  it("promises expenses are KEPT rather than removed", () => {
    const [warning] = clientDeletionWarnings(impact({ expenses: 6 }))
    expect(warning).toContain("will be kept")
    expect(warning).toContain("Project removed")
  })

  it("warns that the portal stops but the sign-in account survives", () => {
    const [warning] = clientDeletionWarnings(impact({ hasPortalAccount: true }))
    expect(warning).toContain("portal stops working")
    expect(warning).toContain("left alone")
  })
})

describe("confirmationMatches", () => {
  it("accepts the code as shown", () => {
    expect(confirmationMatches("ACME", "ACME")).toBe(true)
  })

  it("forgives case and surrounding space", () => {
    expect(confirmationMatches("  acme ", "ACME")).toBe(true)
  })

  it("refuses a near miss", () => {
    expect(confirmationMatches("ACM", "ACME")).toBe(false)
    expect(confirmationMatches("ACMEE", "ACME")).toBe(false)
    expect(confirmationMatches("AC ME", "ACME")).toBe(false)
  })

  it("refuses an empty answer", () => {
    expect(confirmationMatches("", "ACME")).toBe(false)
    expect(confirmationMatches("   ", "ACME")).toBe(false)
  })

  it("refuses everything when the client has no code to type", () => {
    // Guards the degenerate case: an empty expected string must not turn
    // an empty box into a valid confirmation.
    expect(confirmationMatches("", "")).toBe(false)
    expect(confirmationMatches("anything", "  ")).toBe(false)
  })
})
