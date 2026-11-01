import fs from "node:fs"

import { renderToBuffer } from "@react-pdf/renderer"
import { describe, expect, it } from "vitest"

import { ProposalPdf } from "@/lib/pdf/proposal-pdf"
import { EXAMPLE_PROPOSAL } from "@/lib/proposals/prompt"
import { buildProposalView, cleanDraft } from "@/lib/proposals/view"

/**
 * Renders the studio's example proposal end to end - fonts, styles and every
 * section - so a broken style or a missing glyph fails here rather than on
 * the first download.
 *
 * Set PROPOSAL_PDF_OUT to a file path to keep the rendered PDF for a look.
 */

const brief = {
  description: "Job management system for an art framing workshop.",
  value: 80000,
  currency: "INR",
  developmentDays: 30,
  testingDays: 10,
  warrantyDays: 30,
  validityDays: 30,
  signatoryTitle: "CEO",
}

describe("ProposalPdf", () => {
  it("renders the example proposal as an eight-page A4 PDF", async () => {
    const view = buildProposalView(cleanDraft(EXAMPLE_PROPOSAL, brief), {
      refNumber: "PROP-AZ-001",
      issueDate: new Date("2026-10-29T00:00:00Z"),
      brief,
      client: {
        fullName: "Adnan Vadakkan",
        businessName: "Artizo",
        email: "info@artizoframes.com",
        phone: null,
        address: "Dubai",
        country: "UAE",
      },
      issuer: {
        businessName: "Pixie Webs LLP",
        ownerName: "Syed Farhan PN",
        email: "hello@pixiewebs.com",
        phone: "+91 91887 77807",
        address: "Kochi, Kerala",
        website: "pixiewebs.com",
      },
    })

    const buffer = await renderToBuffer(
      ProposalPdf({ view, appearance: { paperColor: "#fbf8f1", documentFont: "serif" } })
    )
    if (process.env.PROPOSAL_PDF_OUT) fs.writeFileSync(process.env.PROPOSAL_PDF_OUT, buffer)

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-")
    const pages = buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []
    expect(pages.length).toBe(8)
  }, 30_000)
})
