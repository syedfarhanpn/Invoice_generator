import type { DocumentStatus } from "@prisma/client"
import { describe, expect, it } from "vitest"

import {
  canDeleteClient,
  canDeleteDocument,
  canVoidDocument,
  partitionClients,
  partitionDocuments,
  whyClientBlocked,
  whyDocumentBlocked,
} from "./bulk-actions"

const ALL_STATUSES: DocumentStatus[] = ["DRAFT", "FINALIZED", "SIGNED", "VOID", "ARCHIVED"]

describe("canDeleteDocument", () => {
  it("allows only a draft", () => {
    expect(ALL_STATUSES.filter(canDeleteDocument)).toEqual(["DRAFT"])
  })

  it("never allows deleting an issued invoice", () => {
    // The whole point: a numbered document is a permanent record.
    expect(canDeleteDocument("FINALIZED")).toBe(false)
    expect(canDeleteDocument("SIGNED")).toBe(false)
  })
})

describe("canVoidDocument", () => {
  it("allows only issued documents", () => {
    expect(ALL_STATUSES.filter(canVoidDocument)).toEqual(["FINALIZED", "SIGNED"])
  })

  it("never allows voiding a draft or re-voiding", () => {
    expect(canVoidDocument("DRAFT")).toBe(false)
    expect(canVoidDocument("VOID")).toBe(false)
  })
})

describe("delete and void are mutually exclusive", () => {
  it("no status permits both", () => {
    for (const s of ALL_STATUSES) {
      expect(canDeleteDocument(s) && canVoidDocument(s)).toBe(false)
    }
  })
})

describe("canDeleteClient", () => {
  it("allows a client that has never been billed", () => {
    expect(canDeleteClient(0)).toBe(true)
  })

  it("refuses a client with any documents", () => {
    // Document.clientId cascades, so this would destroy issued invoices.
    for (const n of [1, 2, 50]) expect(canDeleteClient(n)).toBe(false)
  })
})

describe("partitionDocuments", () => {
  const rows = [
    { id: "1", status: "DRAFT" as DocumentStatus },
    { id: "2", status: "FINALIZED" as DocumentStatus },
    { id: "3", status: "SIGNED" as DocumentStatus },
    { id: "4", status: "VOID" as DocumentStatus },
  ]

  it("splits a mixed selection for delete", () => {
    const { eligible, blocked } = partitionDocuments(rows, "delete")
    expect(eligible.map((r) => r.id)).toEqual(["1"])
    expect(blocked.map((r) => r.id)).toEqual(["2", "3", "4"])
  })

  it("splits a mixed selection for void", () => {
    const { eligible, blocked } = partitionDocuments(rows, "void")
    expect(eligible.map((r) => r.id)).toEqual(["2", "3"])
    expect(blocked.map((r) => r.id)).toEqual(["1", "4"])
  })

  it("returns nothing eligible for an empty selection", () => {
    expect(partitionDocuments([], "delete").eligible).toEqual([])
  })
})

describe("partitionClients", () => {
  it("separates billed clients from unbilled ones", () => {
    const { eligible, blocked } = partitionClients([
      { id: "a", documentCount: 0 },
      { id: "b", documentCount: 3 },
      { id: "c", documentCount: 0 },
    ])
    expect(eligible.map((r) => r.id)).toEqual(["a", "c"])
    expect(blocked.map((r) => r.id)).toEqual(["b"])
  })
})

describe("explanations", () => {
  it("tells the user to void rather than delete an issued document", () => {
    expect(whyDocumentBlocked("FINALIZED", "delete")).toMatch(/void/i)
  })

  it("tells the user to delete rather than void a draft", () => {
    expect(whyDocumentBlocked("DRAFT", "void")).toMatch(/delete/i)
  })

  it("returns null when the action is allowed", () => {
    expect(whyDocumentBlocked("DRAFT", "delete")).toBeNull()
    expect(whyDocumentBlocked("FINALIZED", "void")).toBeNull()
    expect(whyClientBlocked(0)).toBeNull()
  })

  it("says how many documents block a client, with correct pluralisation", () => {
    expect(whyClientBlocked(1)).toContain("1 document -")
    expect(whyClientBlocked(4)).toContain("4 documents")
  })
})
