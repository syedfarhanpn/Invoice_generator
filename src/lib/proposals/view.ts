import { currencyDecimals } from "@/lib/currencies"

import type { ProposalDraft, ProposalMilestone, ProposalPhase } from "./draft"
import type { ProposalBrief } from "./input"

/**
 * Everything a proposal prints, worked out in one place.
 *
 * The on-screen proposal and the PDF both render from `buildProposalView`, so
 * the two can differ in styling but never in content. The rules that matter:
 *
 *  - Money comes from the brief, never from the prose. Claude writes the
 *    words; the price, every milestone's amount and the total are computed
 *    here, with the last milestone absorbing the rounding so they always add
 *    up to the price exactly.
 *  - No price means "To be confirmed", not ₹0.
 *  - Warranty, currency and validity are stated from the brief, not trusted to
 *    the model, because they are commitments.
 */

export const PROPOSAL_PREFIX = "PROP"

/** PROP-ACME-001. A separate series from PRO-, which proformas already use. */
export function proposalRef(code: string, sequence: number): string {
  return `${PROPOSAL_PREFIX}-${code}-${String(sequence).padStart(3, "0")}`
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * "₹80,000", "₹2,35,000", "$12,500", "AED 40,000". Whole amounts print
 * without decimals, which is how a proposal quotes a price.
 */
export function formatProposalMoney(value: number, currency: string): string {
  const decimals = Number.isInteger(value) ? 0 : currencyDecimals(currency)
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(decimals)}`
  }
}

const CURRENCY_NAMES: Record<string, string> = {
  INR: "Indian Rupees",
  USD: "US Dollars",
  EUR: "Euros",
  GBP: "British Pounds",
  CAD: "Canadian Dollars",
  AUD: "Australian Dollars",
  AED: "UAE Dirhams",
  SGD: "Singapore Dollars",
  JPY: "Japanese Yen",
}

export function currencyName(currency: string): string {
  const name = CURRENCY_NAMES[currency]
  return name ? `${name} (${currency})` : currency
}

const DEFAULT_SCHEDULE: ProposalMilestone[] = [
  { milestone: "Advance on confirmation", percent: 50 },
  { milestone: "On go-live", percent: 50 },
]

/**
 * Whole percentages that add up to exactly 100.
 *
 * Claude is asked for that, and usually manages it; this is what makes it
 * true. A schedule that adds up to something else is scaled, with the last
 * milestone taking the difference. Nothing usable falls back to 50/50.
 */
export function normalizeSchedule(rows: ProposalMilestone[]): ProposalMilestone[] {
  const usable = rows
    .map((row) => ({ milestone: row.milestone.trim(), percent: Number(row.percent) }))
    .filter((row) => row.milestone && Number.isFinite(row.percent) && row.percent > 0)
    .slice(0, 6)
  if (usable.length === 0) return DEFAULT_SCHEDULE.map((row) => ({ ...row }))

  const sum = usable.reduce((total, row) => total + row.percent, 0)
  const scaled = usable.map((row) => ({ ...row, percent: Math.round((row.percent * 100) / sum) }))
  const allButLast = scaled.slice(0, -1).reduce((total, row) => total + row.percent, 0)
  const last = 100 - allButLast

  // Rounding pushed the earlier rows past 100 - only possible with many tiny
  // shares. Even split rather than a negative milestone.
  if (last <= 0) {
    const even = Math.floor(100 / usable.length)
    return usable.map((row, i) => ({
      milestone: row.milestone,
      percent: i === usable.length - 1 ? 100 - even * (usable.length - 1) : even,
    }))
  }
  scaled[scaled.length - 1].percent = last
  return scaled
}

/**
 * Splits a price by percentage so the parts add up to the price exactly.
 *
 * A whole price splits into whole amounts (₹80,000 at 40/30/30 is 32,000 /
 * 24,000 / 24,000, never 32,000.40); the last part absorbs the remainder.
 */
export function splitByPercent(total: number, percents: number[], currency: string): number[] {
  if (percents.length === 0) return []
  const decimals = Number.isInteger(total) ? 0 : currencyDecimals(currency)
  const unit = 10 ** decimals
  const totalUnits = Math.round(total * unit)

  const parts = percents.map((p) => Math.floor((totalUnits * p) / 100))
  const assigned = parts.slice(0, -1).reduce((sum, part) => sum + part, 0)
  parts[parts.length - 1] = totalUnits - assigned
  return parts.map((part) => part / unit)
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/** Total days the brief commits to, when it commits to any. */
export function committedDays(brief: Pick<ProposalBrief, "developmentDays" | "testingDays">): number | null {
  if (brief.developmentDays == null) return null
  return brief.developmentDays + (brief.testingDays ?? 0)
}

/**
 * Whole, ordered, in-range phases. When the brief fixes a total, nothing is
 * allowed past it - a phase ending on day 45 of a 40-day proposal is a promise
 * nobody made.
 */
export function normalizePhases(phases: ProposalPhase[], totalDays: number | null): ProposalPhase[] {
  const cap = totalDays ?? Number.POSITIVE_INFINITY
  return phases
    .map((phase) => {
      const startDay = Math.min(Math.max(1, Math.round(Number(phase.startDay) || 1)), cap)
      const endDay = Math.min(Math.max(startDay, Math.round(Number(phase.endDay) || startDay)), cap)
      return { name: phase.name.trim(), startDay, endDay, deliverable: phase.deliverable.trim() }
    })
    .filter((phase) => phase.name)
    .sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay)
    .slice(0, 8)
}

function lastDay(phases: ProposalPhase[]): number | null {
  return phases.length ? Math.max(...phases.map((p) => p.endDay)) : null
}

/** "30 days + 10 testing", "30 days", or the schedule's own length. */
export function timelineLabel(
  brief: Pick<ProposalBrief, "developmentDays" | "testingDays">,
  phases: ProposalPhase[]
): string {
  if (brief.developmentDays != null) {
    const testing = brief.testingDays ?? 0
    return testing > 0
      ? `${brief.developmentDays} days + ${testing} testing`
      : `${brief.developmentDays} days`
  }
  const days = lastDay(phases)
  return days ? `${days} days` : "To be agreed"
}

export type TimelineTick = { label: string; start: number; end: number }

/**
 * Column headings for the timeline chart: D1-5, D6-10, ... Around eight of
 * them whatever the length, in steps of five once steps get past two days.
 */
export function timelineTicks(totalDays: number): TimelineTick[] {
  if (totalDays < 1) return []
  let step = Math.max(1, Math.ceil(totalDays / 8))
  if (step > 2) step = Math.ceil(step / 5) * 5

  const ticks: TimelineTick[] = []
  for (let start = 1; start <= totalDays; start += step) {
    const end = Math.min(totalDays, start + step - 1)
    ticks.push({ label: start === end ? `D${start}` : `D${start}–${end}`, start, end })
  }
  return ticks
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** The operator works in IST - see FOLLOW_UP_ZONE in src/lib/dates.ts. */
const OPERATOR_ZONE = "Asia/Kolkata"

/**
 * Today's calendar date for the operator, stored at midnight UTC like every
 * other document date - so it prints as the same day everywhere.
 */
export function proposalDay(now: Date = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: OPERATOR_ZONE })
    .format(now)
    .split("-")
    .map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
})

/** "29 October 2026". */
export function formatProposalDate(date: Date): string {
  return LONG_DATE.format(date)
}

// ---------------------------------------------------------------------------
// Cleaning Claude's draft
// ---------------------------------------------------------------------------

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function cleanList(items: string[], max: number): string[] {
  return items.map(clean).filter(Boolean).slice(0, max)
}

/** Labels the brief states itself; the model's own versions are dropped. */
const RESERVED_TERM = /warrant|currenc|validity|\bvalid\b/i

/**
 * The draft as it is stored: trimmed, bounded, phases inside the committed
 * days, a schedule that adds up to 100, and the operator's own project name
 * and platforms where they gave them.
 */
export function cleanDraft(draft: ProposalDraft, brief: ProposalBrief): ProposalDraft {
  const totalDays = committedDays(brief)
  return {
    projectName: brief.projectName?.trim() || clean(draft.projectName) || "Project",
    tagline: clean(draft.tagline),
    platforms: brief.platforms?.trim() || clean(draft.platforms),
    summary: {
      headline: clean(draft.summary.headline),
      needs: draft.summary.needs
        .map((row) => ({ need: clean(row.need), delivery: clean(row.delivery) }))
        .filter((row) => row.need && row.delivery)
        .slice(0, 8),
    },
    scope: {
      headline: clean(draft.scope.headline),
      modules: draft.scope.modules
        .map((module) => ({
          label: clean(module.label),
          title: clean(module.title),
          items: cleanList(module.items, 10),
        }))
        .filter((module) => module.title && module.items.length > 0)
        .slice(0, 6),
    },
    howItWorks: {
      headline: clean(draft.howItWorks.headline),
      flow: cleanList(draft.howItWorks.flow, 9),
      stages: draft.howItWorks.stages
        .map((s) => ({ name: clean(s.name), description: clean(s.description) }))
        .filter((s) => s.name)
        .slice(0, 8),
      roles: draft.howItWorks.roles
        .map((r) => ({ role: clean(r.role), platform: clean(r.platform), canDo: clean(r.canDo) }))
        .filter((r) => r.role)
        .slice(0, 8),
      note: clean(draft.howItWorks.note),
    },
    timeline: {
      headline: clean(draft.timeline.headline),
      phases: normalizePhases(draft.timeline.phases, totalDays),
    },
    commercials: {
      includedItems: cleanList(draft.commercials.includedItems, 8),
      paymentSchedule: normalizeSchedule(draft.commercials.paymentSchedule),
      exclusions: cleanList(draft.commercials.exclusions, 8),
    },
    terms: draft.terms
      .map((t) => ({ label: clean(t.label), text: clean(t.text) }))
      .filter((t) => t.label && t.text && !RESERVED_TERM.test(t.label))
      .slice(0, 8),
  }
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export type ProposalParty = {
  fullName: string
  businessName: string | null
  email: string | null
  phone: string | null
  address: string | null
  country: string | null
}

export type ProposalIssuer = {
  businessName: string
  ownerName: string | null
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
}

export type ProposalFacts = {
  refNumber: string
  issueDate: Date
  brief: ProposalBrief
  client: ProposalParty
  issuer: ProposalIssuer | null
}

export type ProposalView = {
  ref: string
  dateLabel: string
  validUntilLabel: string
  issuerName: string
  clientLabel: string
  cover: { projectName: string; tagline: string; forLine: string; byLine: string; validLine: string }
  glance: { label: string; value: string }[]
  sections: { number: string; title: string; key: SectionKey }[]
  summary: ProposalDraft["summary"]
  scope: ProposalDraft["scope"]
  howItWorks: ProposalDraft["howItWorks"] | null
  timeline: {
    headline: string
    phases: ProposalPhase[]
    totalDays: number | null
    ticks: TimelineTick[]
  }
  commercials: {
    hasPrice: boolean
    total: string
    items: { label: string; value: string }[]
    schedule: { milestone: string; percent: number; amount: string }[]
    exclusions: string[]
  }
  terms: { label: string; text: string }[]
  acceptance: string
  parties: {
    client: { heading: string; lines: string[] }
    issuer: { heading: string; lines: string[] }
  }
  /** "PIXIE WEBS LLP — PROPOSAL PROP-AZ-001" */
  footer: string
}

export type SectionKey = "summary" | "scope" | "howItWorks" | "timeline" | "commercials" | "terms"

const SECTION_TITLES: Record<SectionKey, string> = {
  summary: "Summary",
  scope: "Scope of work",
  howItWorks: "How it works",
  timeline: "Timeline",
  commercials: "Commercials",
  terms: "Terms & acceptance",
}

function present(...values: (string | null | undefined)[]): string[] {
  return values.map((v) => v?.trim()).filter((v): v is string => Boolean(v))
}

export function buildProposalView(draft: ProposalDraft, facts: ProposalFacts): ProposalView {
  const { brief, client, issuer } = facts
  const currency = brief.currency
  const hasPrice = brief.value != null && brief.value > 0
  const total = hasPrice ? formatProposalMoney(brief.value!, currency) : "To be confirmed"

  const clientLabel = client.businessName?.trim() || client.fullName.trim()
  const contact = client.businessName?.trim() ? client.fullName.trim() : null
  const issuerName = issuer?.businessName?.trim() || "Our studio"
  const signatory = present(issuer?.ownerName, brief.signatoryTitle).join(", ")

  const validUntil = addDays(facts.issueDate, brief.validityDays)
  const totalDays = committedDays(brief) ?? lastDay(draft.timeline.phases)

  const howItWorks =
    draft.howItWorks.flow.length || draft.howItWorks.stages.length || draft.howItWorks.roles.length
      ? draft.howItWorks
      : null

  const keys: SectionKey[] = ["summary", "scope", ...(howItWorks ? ["howItWorks" as const] : []), "timeline", "commercials", "terms"]
  const sections = keys.map((key, i) => ({ number: String(i + 1).padStart(2, "0"), title: SECTION_TITLES[key], key }))

  const schedule = draft.commercials.paymentSchedule
  const amounts = hasPrice ? splitByPercent(brief.value!, schedule.map((m) => m.percent), currency) : []

  const warrantyDays = brief.warrantyDays ?? 0
  const terms = [
    {
      label: "Warranty",
      text:
        warrantyDays > 0
          ? `${warrantyDays} days of free bug fixes after go-live`
          : "No warranty period is included; fixes after go-live are quoted separately",
    },
    ...draft.terms,
    { label: "Currency", text: `All amounts are in ${currencyName(currency)}` },
    {
      label: "Validity",
      text: `This proposal is valid for ${brief.validityDays} days from the date above, until ${formatProposalDate(validUntil)}`,
    },
  ]

  const startsOnAdvance = /advance|confirm|booking|signing/i.test(schedule[0]?.milestone ?? "")
  const acceptance =
    `To go ahead, simply reply to the message this proposal was sent with, confirming proposal ` +
    `${facts.refNumber}${hasPrice ? ` for ${total}` : ""}. ` +
    (startsOnAdvance ? "Work begins once the advance payment is received." : "Work begins on confirmation.")

  return {
    ref: facts.refNumber,
    dateLabel: formatProposalDate(facts.issueDate),
    validUntilLabel: formatProposalDate(validUntil),
    issuerName,
    clientLabel,
    cover: {
      projectName: draft.projectName,
      tagline: draft.tagline,
      forLine: present(clientLabel, contact).join(" — "),
      byLine: present(issuerName, signatory).join(" — "),
      validLine: `${brief.validityDays} days from date of issue`,
    },
    glance: [
      { label: "Investment", value: total },
      { label: "Timeline", value: timelineLabel(brief, draft.timeline.phases) },
      ...(draft.platforms ? [{ label: "Platforms", value: draft.platforms }] : []),
      { label: "Warranty", value: warrantyDays > 0 ? `${warrantyDays} days` : "Not included" },
    ],
    sections,
    summary: draft.summary,
    scope: draft.scope,
    howItWorks,
    timeline: {
      headline: draft.timeline.headline,
      phases: draft.timeline.phases,
      totalDays,
      ticks: totalDays ? timelineTicks(totalDays) : [],
    },
    commercials: {
      hasPrice,
      total,
      items: draft.commercials.includedItems.map((label) => ({ label, value: "Included" })),
      schedule: schedule.map((m, i) => ({
        milestone: m.milestone,
        percent: m.percent,
        amount: hasPrice ? formatProposalMoney(amounts[i], currency) : "—",
      })),
      exclusions: draft.commercials.exclusions,
    },
    terms,
    acceptance,
    parties: {
      client: {
        heading: clientLabel,
        lines: present(contact, client.email, client.phone, client.address, client.country),
      },
      issuer: {
        heading: issuerName,
        lines: present(signatory, issuer?.address, issuer?.phone, issuer?.email, issuer?.website),
      },
    },
    footer: `${issuerName} — Proposal ${facts.refNumber}`,
  }
}
