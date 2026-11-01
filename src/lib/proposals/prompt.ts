import type { ProposalDraft } from "./draft"
import type { ProposalBrief } from "./input"

/**
 * What Claude is told.
 *
 * The system prompt is fixed text - no names, dates or ids - so it is the
 * same bytes on every request and can be served from the prompt cache. All
 * of a request's specifics go in the user message.
 *
 * Only what the writing needs is sent: the client's name, business and
 * location, never their phone or email; and never the price. The model does
 * not need the figure to write the words, and the surest way to stop it
 * printing a wrong one is not to give it one to print.
 */

/**
 * One of the studio's own proposals (for Artizo, a framing workshop),
 * reduced to the JSON this app asks for. It sets the voice and the density -
 * short, specific, no adjectives doing the work.
 */
export const EXAMPLE_PROPOSAL: ProposalDraft = {
  projectName: "Job Track",
  tagline:
    "Order, job, salesperson, inventory and operations management system for Artizo's art framing business in Dubai. Web app plus a salesperson PWA, delivered in 30 days with 10 days of testing.",
  platforms: "Web app + Sales PWA",
  summary: {
    headline:
      "Artizo handles retail and wholesale framing jobs that pass through several hands before delivery. This proposal covers one system where every order is entered, tracked stage by stage and closed with a photo of the finished frame.",
    needs: [
      { need: "Enter retail and wholesale jobs in one place", delivery: "Order entry with customer, artwork, frame specifications, quantity, price and due date, tagged retail or wholesale" },
      { need: "Know where every job stands", delivery: "Each job moves through clear stages, from received to working to completed and delivered, with who did what and when" },
      { need: "Proof of the finished product", delivery: "Upload photos of the final framed piece against each job before it is marked completed" },
      { need: "Salespeople take orders on the move", delivery: "Installable salesperson app (PWA) on their phones to create orders, capture artwork photos and follow their jobs" },
      { need: "Control over materials", delivery: "Inventory of mouldings, mounts, glass and hardware, with stock issued against jobs and low-stock alerts" },
      { need: "Monitor the whole operation", delivery: "Dashboard of jobs by stage, overdue jobs, salesperson performance and sales reports" },
    ],
  },
  scope: {
    headline: "A web app for the office and workshop, plus a progressive web app (PWA) for salespeople, sharing one database.",
    modules: [
      {
        label: "Module 1 · Web",
        title: "Orders & Jobs",
        items: [
          "Create retail and wholesale orders, one or more jobs per order",
          "Customer details, artwork size, moulding, mount, glass, quantity",
          "Price, advance paid and balance due",
          "Job stages: received, working, completed, delivered",
          "Assign jobs to workshop staff, with due dates",
          "Upload final product photos before completion",
          "Full history of each job: who moved it, and when",
          "Printable job card and order summary (PDF)",
        ],
      },
      {
        label: "Module 2 · PWA",
        title: "Salesperson App",
        items: [
          "Installs on any phone from the browser, no app store needed",
          "Secure login for each salesperson",
          "Create orders on site and capture artwork photos",
          "Track the stage of their own orders",
          "View their own sales for the month",
        ],
      },
      {
        label: "Module 3 · Web",
        title: "Inventory",
        items: [
          "Item master: mouldings, mounts, glass, backing, hardware",
          "Stock in from suppliers, stock out against jobs",
          "Low-stock alerts at set minimum levels",
          "Supplier list",
        ],
      },
    ],
  },
  howItWorks: {
    headline: "Every job follows the same path, and nothing is marked complete without a photo of the finished frame.",
    flow: ["Order taken (office or salesperson)", "Job received", "Assigned to workshop", "Working", "Final photo uploaded", "Completed", "Delivered"],
    stages: [
      { name: "Received", description: "Order and job details entered, retail or wholesale, with due date" },
      { name: "Working", description: "Job assigned to a workshop staff member; materials issued from inventory" },
      { name: "Completed", description: "Final product photo uploaded; job ready for collection or delivery" },
      { name: "Delivered", description: "Handed over to the customer and balance recorded" },
    ],
    roles: [
      { role: "Admin / owner", platform: "Web app", canDo: "Everything, including users, settings and all reports" },
      { role: "Workshop staff", platform: "Web app", canDo: "View assigned jobs, update stage, upload final photos" },
      { role: "Salesperson", platform: "PWA on phone", canDo: "Create orders, capture photos, track own orders and sales" },
    ],
    note: "Stage names can be adjusted during the design phase to match Artizo's workshop.",
  },
  timeline: {
    headline: "30 days of development followed by 10 days of testing, live on day 40 from the advance payment.",
    phases: [
      { name: "Discovery & design", startDay: 1, endDay: 5, deliverable: "Requirements confirmed, job stages agreed, screens designed and approved" },
      { name: "Orders, jobs & inventory", startDay: 6, endDay: 20, deliverable: "Order entry, job stages, photo upload, inventory, user roles" },
      { name: "Sales PWA & dashboard", startDay: 16, endDay: 30, deliverable: "Salesperson app, dashboard, reports and exports" },
      { name: "Testing", startDay: 31, endDay: 40, deliverable: "Testing with Artizo's team, fixes and final changes" },
      { name: "Go-live", startDay: 40, endDay: 40, deliverable: "Deployment, data setup, training for staff and salespeople" },
    ],
  },
  commercials: {
    includedItems: [
      "Web app — orders, jobs, inventory, operations and admin",
      "Salesperson progressive web app (PWA)",
      "Testing, deployment and training",
      "30-day warranty after go-live",
    ],
    paymentSchedule: [
      { milestone: "Advance on confirmation", percent: 40 },
      { milestone: "Development complete, testing begins (day 30)", percent: 30 },
      { milestone: "Go-live", percent: 30 },
    ],
    exclusions: [
      "Server, hosting and domain charges",
      "Annual maintenance contract (AMC) after the warranty, quoted separately",
      "WhatsApp, SMS or email gateway charges, if added later",
      "Features outside this scope (quoted separately)",
    ],
  },
  terms: [
    { label: "Training", text: "Online training for the admin, workshop staff and salespeople, plus a short user guide" },
    { label: "AMC", text: "Not included; maintenance and support after the warranty is quoted separately" },
    { label: "Change requests", text: "Changes after design approval are estimated and approved before work starts" },
    { label: "Client inputs", text: "Product and material list, job stages, user list and logo, shared in the first week, with a single point of contact for approvals" },
    { label: "Source code", text: "Source code and admin access are handed over after the final payment" },
  ],
}

export const PROPOSAL_SYSTEM_PROMPT = `You write project proposals for a small software and web studio. The studio fills in a short brief about a client and a project; you write the body of the proposal it will send. The app lays out the document and prints every figure itself - the price, each payment's amount, the dates and the proposal number - and it adds the warranty, currency and validity terms. You write the words.

Voice
- Write as the studio ("we"), about the client by name. Plain, specific business English, in the client's own vocabulary: their trade, their stages, their roles.
- Short. Table cells are phrases; bullets are one line each, roughly 12 words or fewer; headlines are one or two sentences.
- No marketing language, superlatives, exclamation marks or emojis. Never "cutting-edge", "seamless", "robust", "state-of-the-art", "world-class".

Facts
- Never write a price, an amount of money, a discount or tax, or a calendar date in any field. Durations in days are fine. Payment shares appear only as percentages in paymentSchedule.
- The scope comes from the description. Break it into modules and include the supporting pieces a working system needs when the description implies them (sign-in, roles, admin, reports, deployment, training). Do not add features or integrations the description does not ask for; list the likely-but-unasked ones under exclusions instead.
- Where the brief leaves something out, make a sensible, modest assumption that fits the description.

Timeline
- Days count from the advance payment, starting at day 1. Phases may overlap.
- If development days D are given: build phases fit inside days 1 to D. If testing days T are also given, add a testing phase from day D+1 to day D+T. End with a one-day "Go-live" phase on the last day.
- If no days are given, propose a realistic schedule for the scope.
- timeline.headline states the schedule in days, e.g. "30 days of development followed by 10 days of testing, live on day 40 from the advance payment."

Payment schedule
- Follow the brief's payment terms when given. Otherwise use 40% advance on confirmation, 30% when development is complete, 30% at go-live; for a small project, 50% advance and 50% at go-live.
- Whole percentages that add up to exactly 100. Milestones name events on the timeline, never dates.

Fields
- projectName: a short product-style name, one to three words. If the brief gives a project name, use it exactly.
- tagline: one sentence for the cover - what is built, for whom, on which platforms and over how long. No price.
- platforms: what gets delivered, as a short label such as "Web app + Sales PWA". If the brief gives platforms, use them.
- summary.headline: the client's situation and what this proposal covers, in one or two sentences.
- summary.needs: four to seven rows, each a need of the client paired with what we deliver for it.
- scope.headline: one sentence on the shape of the solution.
- scope.modules: two to six modules. label like "Module 1 · Web"; title like "Orders & Jobs"; four to eight items each.
- howItWorks: the core workflow. flow is four to eight steps in order. stages are the named states the system will use, with one line each. roles are the user roles with their platform and what they can do. Use empty lists when a part does not apply (a single-user tool has no roles), and note is one optional sentence or "".
- timeline.phases: three to seven phases, each with whole-number startDay and endDay and its deliverable.
- commercials.includedItems: three to six things the price covers, as short labels.
- commercials.exclusions: three to six things not included.
- terms: four to seven rows, each a label and one sentence - for example training, maintenance (AMC), change requests, client inputs, source code and access, hosting. Do not write warranty, currency or validity rows.

Here is one of the studio's proposals, for a different client, in this format. Match its voice and density; never reuse its content.

<example>
${JSON.stringify(EXAMPLE_PROPOSAL, null, 2)}
</example>`

function line(label: string, value: string | number | null | undefined, fallback: string): string {
  const text = value == null || value === "" ? fallback : String(value)
  return `${label}: ${text}`
}

export type BriefParty = {
  fullName: string
  businessName: string | null
  address: string | null
  country: string | null
}

/** The user message for a first draft. */
export function briefMessage(args: {
  brief: ProposalBrief
  client: BriefParty
  studioName: string
}): string {
  const { brief, client, studioName } = args
  const location = [client.address, client.country].filter(Boolean).join(", ")

  return [
    "Write the proposal for this brief.",
    "",
    "<studio>",
    line("Name", studioName, "(not set)"),
    "</studio>",
    "",
    "<client>",
    line("Contact", client.fullName, "(not given)"),
    line("Business", client.businessName, "(none - address the contact)"),
    line("Location", location, "(not given)"),
    "</client>",
    "",
    "<project>",
    line("Project name", brief.projectName, "(not given - suggest one)"),
    line("Platforms", brief.platforms, "(not given - decide from the description)"),
    line("Development days", brief.developmentDays, "(not given - propose a schedule)"),
    line("Testing days", brief.testingDays, brief.developmentDays != null ? "0 - no separate testing phase" : "(not given)"),
    line("Warranty after go-live", brief.warrantyDays ? `${brief.warrantyDays} days` : null, "none"),
    line("Payment terms", brief.paymentTerms, "(not given - use the default schedule)"),
    "</project>",
    "",
    "<description>",
    brief.description,
    "</description>",
    ...(brief.instructions ? ["", "<instructions>", brief.instructions, "</instructions>"] : []),
  ].join("\n")
}

/** The user message for a revision of an existing draft. */
export function revisionMessage(args: {
  brief: ProposalBrief
  client: BriefParty
  studioName: string
  current: ProposalDraft
  change: string
}): string {
  return [
    briefMessage(args),
    "",
    "This proposal was already written from that brief:",
    "",
    "<current_proposal>",
    JSON.stringify(args.current, null, 2),
    "</current_proposal>",
    "",
    "Revise it as follows, and return the complete proposal. Keep everything the change does not touch as it is.",
    "",
    "<change>",
    args.change,
    "</change>",
  ].join("\n")
}
