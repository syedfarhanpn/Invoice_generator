import { describe, expect, it } from "vitest"

import { isNavItemActive } from "./nav"

const ITEMS = [
  { key: "Dashboard", match: "/dashboard", exact: true },
  { key: "Documents", match: "/dashboard/documents" },
  { key: "Clients", match: "/dashboard/clients" },
  { key: "Settings", match: "/dashboard/settings" },
]

const activeFor = (path: string) => ITEMS.filter((i) => isNavItemActive(path, i)).map((i) => i.key)

describe("isNavItemActive", () => {
  it.each([
    ["/dashboard", ["Dashboard"]],
    ["/dashboard/documents", ["Documents"]],
    ["/dashboard/documents/new", ["Documents"]],
    ["/dashboard/documents/abc123", ["Documents"]],
    ["/dashboard/clients/xyz/edit", ["Clients"]],
    ["/dashboard/settings/business", ["Settings"]],
  ])("highlights exactly one item on %s", (path, expected) => {
    expect(activeFor(path)).toEqual(expected)
  })

  it("does not leave the index item lit on sub-routes", () => {
    // The original bug: "/dashboard" is a prefix of every other route.
    expect(activeFor("/dashboard/documents")).not.toContain("Dashboard")
  })

  it("matches only on a segment boundary", () => {
    expect(activeFor("/dashboard/clients-archive")).toEqual([])
  })
})
