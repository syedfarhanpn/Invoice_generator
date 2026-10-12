import { describe, expect, it } from "vitest"

import {
  escapeHtml,
  renderInviteEmail,
  roleCapabilities,
  type InviteEmailInput,
} from "@/lib/email/invite-email"

function input(overrides: Partial<InviteEmailInput> = {}): InviteEmailInput {
  return {
    brandName: "Pixie Webs LLP",
    inviterName: "Syed Farhan",
    email: "partner@example.com",
    role: "DEVELOPER",
    title: null,
    note: null,
    actionUrl: "https://app.example.com/auth/confirm?token_hash=abc&type=invite",
    ...overrides,
  }
}

describe("escapeHtml", () => {
  it("neutralises a tag", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    )
  })

  it("escapes quotes, so text cannot break out of an attribute", () => {
    expect(escapeHtml(`" onmouseover="x`)).toBe("&quot; onmouseover=&quot;x")
  })

  it("escapes the ampersand first, not twice", () => {
    expect(escapeHtml("Tom & Jerry <co>")).toBe("Tom &amp; Jerry &lt;co&gt;")
  })
})

describe("roleCapabilities", () => {
  it("separates what a role can edit from what it can only read", () => {
    const { canEdit, canView } = roleCapabilities("DEVELOPER")
    expect(canEdit).toContain("Projects")
    expect(canEdit).toContain("Tasks")
    expect(canView).toContain("Calendar")
    expect(canEdit).not.toContain("Calendar")
  })

  it("gives an admin everything to manage and nothing merely to view", () => {
    const { canEdit, canView } = roleCapabilities("ADMIN")
    expect(canEdit).toContain("Team Management")
    expect(canEdit).toContain("Settings")
    expect(canView).toEqual([])
  })

  it("leaves out modules the role cannot reach at all", () => {
    const { canEdit, canView } = roleCapabilities("CONTENT_CREATOR")
    expect([...canEdit, ...canView]).not.toContain("Expenses")
    expect([...canEdit, ...canView]).not.toContain("Team Management")
  })

  it("describes an accountant by the money modules they hold", () => {
    const { canEdit } = roleCapabilities("ACCOUNTANT")
    expect(canEdit).toEqual(
      expect.arrayContaining(["Documents", "Expenses", "AMC & Renewals", "Domains & Hosting"])
    )
  })
})

describe("renderInviteEmail", () => {
  it("leads the subject with the company, not the product", () => {
    const { subject } = renderInviteEmail(input())
    expect(subject).toBe("Pixie Webs LLP: your invitation to join as Developer")
  })

  it("names the person who invited them", () => {
    const { html, text } = renderInviteEmail(input())
    expect(text).toContain("Syed Farhan has invited you to join Pixie Webs LLP")
    expect(html).toContain("Syed Farhan has invited you to join Pixie Webs LLP")
  })

  it("falls back to the company alone when no inviter name is known", () => {
    const { text } = renderInviteEmail(input({ inviterName: null }))
    expect(text).toContain("You have been invited to join Pixie Webs LLP")
    expect(text).not.toContain("null")
  })

  it("carries the action link in both the button and the pasteable fallback", () => {
    const url = "https://app.example.com/auth/confirm?token_hash=xyz&type=invite"
    const { html, text } = renderInviteEmail(input({ actionUrl: url }))
    // Escaped in HTML (the & becomes &amp;) but present, and raw in text.
    expect(html).toContain('href="https://app.example.com/auth/confirm?token_hash=xyz&amp;type=invite"')
    expect(text).toContain(url)
  })

  it("shows the address to sign in with, so a forwarded mail is unambiguous", () => {
    const { html, text } = renderInviteEmail(input())
    expect(html).toContain("partner@example.com")
    expect(text).toContain("Sign in with: partner@example.com")
  })

  it("pairs a job title with the role when one was set", () => {
    const { html } = renderInviteEmail(input({ title: "Backend engineer" }))
    expect(html).toContain("Backend engineer · Developer")
  })

  it("shows the role alone when no title was set", () => {
    const { text } = renderInviteEmail(input())
    expect(text).toContain("Role: Developer")
  })

  it("describes access from the role's real defaults", () => {
    const { text } = renderInviteEmail(input({ role: "ACCOUNTANT" }))
    expect(text).toContain("You will be able to manage")
    expect(text).toContain("Expenses")
    // An accountant reads clients rather than editing them.
    expect(text).toContain("You will be able to view")
  })

  it("includes the inviter's note when there is one", () => {
    const { html, text } = renderInviteEmail(input({ note: "Welcome aboard, start Monday." }))
    expect(text).toContain("Welcome aboard, start Monday.")
    expect(html).toContain("Welcome aboard, start Monday.")
  })

  it("omits the note block entirely when there is none", () => {
    const { html } = renderInviteEmail(input({ note: "   " }))
    expect(html).not.toContain("border-left:3px solid")
  })

  it("escapes a note rather than letting it inject markup", () => {
    const { html } = renderInviteEmail(input({ note: "<img src=x onerror=alert(1)>" }))
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x")
  })

  it("escapes a company name with an ampersand in it", () => {
    const { html, subject } = renderInviteEmail(input({ brandName: "Smith & Sons" }))
    expect(html).toContain("Smith &amp; Sons")
    // The subject is plain text and goes in a header, so it is not escaped.
    expect(subject).toContain("Smith & Sons")
  })

  it("produces a text part as well as HTML", () => {
    const { text, html } = renderInviteEmail(input())
    expect(text.length).toBeGreaterThan(80)
    expect(html.startsWith("<!doctype html>")).toBe(true)
  })
})
