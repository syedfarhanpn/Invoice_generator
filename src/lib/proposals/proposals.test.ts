import { describe, expect, it } from "vitest"

import type { ProposalDraft } from "@/lib/proposals/draft"
import { newProposalClientSchema, proposalBriefSchema, type ProposalBrief } from "@/lib/proposals/input"
import { briefMessage, PROPOSAL_SYSTEM_PROMPT, revisionMessage } from "@/lib/proposals/prompt"
import {
  buildProposalView,
  cleanDraft,
  formatProposalMoney,
  normalizePhases,
  normalizeSchedule,
  proposalDay,
  proposalRef,
  splitByPercent,
  timelineLabel,
  timelineTicks,
} from "@/lib/proposals/view"

const BRIEF: ProposalBrief = {
  description: "Job management system for an art framing workshop with a salesperson app.",
  value: 80000,
  currency: "INR",
  developmentDays: 30,
  testingDays: 10,
  warrantyDays: 30,
  validityDays: 30,
}

function draft(overrides: Partial<ProposalDraft> = {}): ProposalDraft {
  return {
    projectName: "Job Track",
    tagline: "A job system for Artizo.",
    platforms: "Web app + Sales PWA",
    summary: { headline: "Artizo frames art.", needs: [{ need: "Track jobs", delivery: "Job stages" }] },
    scope: { headline: "One web app.", modules: [{ label: "Module 1 · Web", title: "Orders", items: ["Create orders"] }] },
    howItWorks: { headline: "", flow: ["Order", "Deliver"], stages: [], roles: [], note: "" },
    timeline: {
      headline: "40 days.",
      phases: [
        { name: "Design", startDay: 1, endDay: 5, deliverable: "Screens" },
        { name: "Testing", startDay: 31, endDay: 40, deliverable: "Fixes" },
      ],
    },
    commercials: {
      includedItems: ["Web app", "Training"],
      paymentSchedule: [
        { milestone: "Advance on confirmation", percent: 40 },
        { milestone: "Development complete", percent: 30 },
        { milestone: "Go-live", percent: 30 },
      ],
      exclusions: ["Hosting"],
    },
    terms: [{ label: "Training", text: "Online training for the team" }],
    ...overrides,
  }
}

const CLIENT = {
  fullName: "Adnan Vadakkan",
  businessName: "Artizo",
  email: "info@artizoframes.com",
  phone: "+971 50 000 0000",
  address: "Dubai",
  country: "UAE",
}

const ISSUER = {
  businessName: "Pixie Webs LLP",
  ownerName: "Syed Farhan PN",
  email: "hello@pixiewebs.com",
  phone: "+91 91887 77807",
  address: "Kochi, Kerala",
  website: "pixiewebs.com",
}

describe("proposalRef", () => {
  it("numbers on its own PROP series, apart from proformas' PRO", () => {
    expect(proposalRef("AZ", 1)).toBe("PROP-AZ-001")
    expect(proposalRef("ACME", 12)).toBe("PROP-ACME-012")
  })
})

describe("formatProposalMoney", () => {
  it("groups rupees the Indian way and drops .00 on a whole price", () => {
    expect(formatProposalMoney(80000, "INR")).toBe("₹80,000")
    expect(formatProposalMoney(235000, "INR")).toBe("₹2,35,000")
  })

  it("keeps the decimals a fractional price actually has", () => {
    expect(formatProposalMoney(999.5, "USD")).toBe("$999.50")
  })
})

describe("normalizeSchedule", () => {
  it("leaves a schedule that already adds up alone", () => {
    const rows = normalizeSchedule(draft().commercials.paymentSchedule)
    expect(rows.map((r) => r.percent)).toEqual([40, 30, 30])
  })

  it("scales one that does not, so it always totals exactly 100", () => {
    const rows = normalizeSchedule([
      { milestone: "Advance", percent: 50 },
      { milestone: "Midway", percent: 30 },
      { milestone: "End", percent: 30 },
    ])
    expect(rows.reduce((sum, r) => sum + r.percent, 0)).toBe(100)
    expect(rows.map((r) => r.percent)).toEqual([45, 27, 28])
  })

  it("falls back to 50/50 when nothing usable came back", () => {
    const rows = normalizeSchedule([{ milestone: "", percent: 40 }, { milestone: "x", percent: -5 }])
    expect(rows).toEqual([
      { milestone: "Advance on confirmation", percent: 50 },
      { milestone: "On go-live", percent: 50 },
    ])
  })
})

describe("splitByPercent", () => {
  it("splits a whole price into whole amounts", () => {
    expect(splitByPercent(80000, [40, 30, 30], "INR")).toEqual([32000, 24000, 24000])
  })

  it("puts the rounding on the last milestone so the parts add up to the price", () => {
    const parts = splitByPercent(100000, [33, 33, 34], "INR")
    expect(parts).toEqual([33000, 33000, 34000])
    const odd = splitByPercent(10001, [50, 50], "INR")
    expect(odd).toEqual([5000, 5001])
    expect(odd[0] + odd[1]).toBe(10001)
  })

  it("splits a fractional price in minor units", () => {
    const parts = splitByPercent(1000.5, [50, 50], "USD")
    expect(parts[0] + parts[1]).toBeCloseTo(1000.5, 10)
  })
})

describe("normalizePhases", () => {
  it("keeps every phase inside the committed days", () => {
    const phases = normalizePhases(
      [
        { name: "Testing", startDay: 31, endDay: 45, deliverable: "" },
        { name: "Design", startDay: 0, endDay: 5.4, deliverable: "" },
      ],
      40
    )
    expect(phases).toEqual([
      { name: "Design", startDay: 1, endDay: 5, deliverable: "" },
      { name: "Testing", startDay: 31, endDay: 40, deliverable: "" },
    ])
  })

  it("never lets a phase end before it starts", () => {
    const [phase] = normalizePhases([{ name: "Go-live", startDay: 40, endDay: 12, deliverable: "" }], null)
    expect(phase.endDay).toBe(40)
  })
})

describe("timeline labels", () => {
  it("states the committed days the way the studio writes them", () => {
    expect(timelineLabel(BRIEF, [])).toBe("30 days + 10 testing")
    expect(timelineLabel({ developmentDays: 30, testingDays: 0 }, [])).toBe("30 days")
  })

  it("falls back to the schedule's own length when no days were given", () => {
    const phases = [{ name: "Build", startDay: 1, endDay: 21, deliverable: "" }]
    expect(timelineLabel({ developmentDays: null, testingDays: null }, phases)).toBe("21 days")
    expect(timelineLabel({ developmentDays: null, testingDays: null }, [])).toBe("To be agreed")
  })

  it("heads the chart in about eight columns", () => {
    expect(timelineTicks(40).map((t) => t.label)).toEqual([
      "D1–5", "D6–10", "D11–15", "D16–20", "D21–25", "D26–30", "D31–35", "D36–40",
    ])
    expect(timelineTicks(12).at(-1)).toEqual({ label: "D11–12", start: 11, end: 12 })
  })
})

describe("proposalDay", () => {
  it("is the IST calendar day, at midnight UTC", () => {
    // 20:00 UTC on the 28th is 01:30 on the 29th in India.
    expect(proposalDay(new Date("2026-10-28T20:00:00Z")).toISOString()).toBe("2026-10-29T00:00:00.000Z")
  })
})

describe("cleanDraft", () => {
  it("uses the operator's project name and platforms over the model's", () => {
    const cleaned = cleanDraft(draft(), { ...BRIEF, projectName: "FrameFlow", platforms: "Web app" })
    expect(cleaned.projectName).toBe("FrameFlow")
    expect(cleaned.platforms).toBe("Web app")
  })

  it("drops the model's own warranty, currency and validity terms", () => {
    const cleaned = cleanDraft(
      draft({
        terms: [
          { label: "Warranty", text: "90 days" },
          { label: "Currency", text: "USD" },
          { label: "Validity", text: "Forever" },
          { label: "Source code", text: "Handed over after final payment" },
        ],
      }),
      BRIEF
    )
    expect(cleaned.terms).toEqual([{ label: "Source code", text: "Handed over after final payment" }])
  })
})

describe("buildProposalView", () => {
  const view = buildProposalView(cleanDraft(draft(), BRIEF), {
    refNumber: "PROP-AZ-001",
    issueDate: new Date("2026-10-29T00:00:00Z"),
    brief: { ...BRIEF, signatoryTitle: "CEO" },
    client: CLIENT,
    issuer: ISSUER,
  })

  it("prints the cover the studio's proposals have", () => {
    expect(view.dateLabel).toBe("29 October 2026")
    expect(view.cover.forLine).toBe("Artizo — Adnan Vadakkan")
    expect(view.cover.byLine).toBe("Pixie Webs LLP — Syed Farhan PN, CEO")
    expect(view.glance).toEqual([
      { label: "Investment", value: "₹80,000" },
      { label: "Timeline", value: "30 days + 10 testing" },
      { label: "Platforms", value: "Web app + Sales PWA" },
      { label: "Warranty", value: "30 days" },
    ])
  })

  it("computes every milestone amount from the price", () => {
    expect(view.commercials.schedule.map((m) => m.amount)).toEqual(["₹32,000", "₹24,000", "₹24,000"])
  })

  it("states warranty, currency and validity from the brief", () => {
    expect(view.terms[0]).toEqual({ label: "Warranty", text: "30 days of free bug fixes after go-live" })
    expect(view.terms.at(-2)).toEqual({ label: "Currency", text: "All amounts are in Indian Rupees (INR)" })
    expect(view.terms.at(-1)?.text).toContain("until 28 November 2026")
    expect(view.acceptance).toContain("confirming proposal PROP-AZ-001 for ₹80,000")
  })

  it("numbers the sections, skipping how-it-works when there is none", () => {
    expect(view.sections.map((s) => s.number + " " + s.title)).toContain("03 How it works")
    const bare = buildProposalView(
      cleanDraft(draft({ howItWorks: { headline: "", flow: [], stages: [], roles: [], note: "" } }), BRIEF),
      { refNumber: "PROP-AZ-001", issueDate: new Date(), brief: BRIEF, client: CLIENT, issuer: ISSUER }
    )
    expect(bare.howItWorks).toBeNull()
    expect(bare.sections.map((s) => s.title)).toEqual([
      "Summary", "Scope of work", "Timeline", "Commercials", "Terms & acceptance",
    ])
  })

  it("says 'To be confirmed' rather than printing zero when there is no price", () => {
    const unpriced = buildProposalView(cleanDraft(draft(), BRIEF), {
      refNumber: "PROP-AZ-002",
      issueDate: new Date(),
      brief: { ...BRIEF, value: null },
      client: { ...CLIENT, businessName: null },
      issuer: null,
    })
    expect(unpriced.commercials.total).toBe("To be confirmed")
    expect(unpriced.commercials.schedule.every((m) => m.amount === "—")).toBe(true)
    expect(unpriced.acceptance).not.toContain("for ")
    expect(unpriced.cover.forLine).toBe("Adnan Vadakkan")
  })
})

describe("input rules", () => {
  it("needs only a name and a phone number for a new client", () => {
    expect(newProposalClientSchema.safeParse({ fullName: "Adnan", phone: "+971 50 123 4567" }).success).toBe(true)
    expect(newProposalClientSchema.safeParse({ fullName: "Adnan", phone: "" }).success).toBe(false)
    expect(newProposalClientSchema.safeParse({ fullName: "", phone: "9876543210" }).success).toBe(false)
  })

  it("accepts a blank email but not a malformed one", () => {
    expect(newProposalClientSchema.safeParse({ fullName: "A", phone: "9876543210", email: "" }).success).toBe(true)
    expect(newProposalClientSchema.safeParse({ fullName: "A", phone: "9876543210", email: "nope" }).success).toBe(false)
  })

  it("needs a description Claude can actually write from", () => {
    expect(proposalBriefSchema.safeParse({ ...BRIEF, description: "website" }).success).toBe(false)
    expect(proposalBriefSchema.safeParse(BRIEF).success).toBe(true)
  })
})

describe("prompt", () => {
  const client = { fullName: "Adnan Vadakkan", businessName: "Artizo", address: "Dubai", country: "UAE" }

  it("never sends the price, the phone or the email to the model", () => {
    const message = briefMessage({ brief: BRIEF, client, studioName: "Pixie Webs LLP" })
    expect(message).not.toMatch(/80,?000/)
    expect(message).toContain("Development days: 30")
    expect(message).toContain("Location: Dubai, UAE")
  })

  it("keeps the system prompt free of anything request-specific, so it caches", () => {
    expect(PROPOSAL_SYSTEM_PROMPT).not.toContain("Pixie Webs")
    expect(PROPOSAL_SYSTEM_PROMPT).toContain("Never write a price")
  })

  it("sends the current draft and the change for a revision", () => {
    const message = revisionMessage({
      brief: BRIEF,
      client,
      studioName: "Pixie Webs LLP",
      current: draft(),
      change: "Make the payment schedule 50/50",
    })
    expect(message).toContain("<current_proposal>")
    expect(message).toContain("Make the payment schedule 50/50")
  })
})
