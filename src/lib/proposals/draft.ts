// zod/v4 rather than the zod v3 the rest of the app uses: the Anthropic SDK's
// structured-output helper builds its JSON schema from v4 types. Both ship in
// the same installed package.
import * as z from "zod/v4"

/**
 * The words of a proposal, exactly as Claude returns them.
 *
 * Shaped after the proposals the studio already sends (cover, summary, scope,
 * how it works, timeline, commercials, terms) so a generated one reads like
 * the rest. There is no money anywhere in here on purpose: the price and each
 * milestone's amount are computed from the brief when the proposal is
 * rendered, so the prose and the figures can never disagree.
 *
 * No length limits in the schema - structured outputs accept only a subset of
 * JSON Schema - so sizes are asked for in the prompt and enforced when the
 * draft is normalised (src/lib/proposals/view.ts).
 */

const needRow = z.object({
  need: z.string().describe("The client's need, as a short phrase."),
  delivery: z.string().describe("What we deliver for it, in one sentence."),
})

const scopeModule = z.object({
  label: z.string().describe('e.g. "Module 1 · Web"'),
  title: z.string().describe('e.g. "Orders & Jobs"'),
  items: z.array(z.string()).describe("One-line bullets."),
})

const stage = z.object({
  name: z.string(),
  description: z.string(),
})

const role = z.object({
  role: z.string(),
  platform: z.string(),
  canDo: z.string(),
})

const phase = z.object({
  name: z.string(),
  startDay: z.number().describe("First day, counted from the advance payment (day 1)."),
  endDay: z.number().describe("Last day, inclusive."),
  deliverable: z.string(),
})

const milestone = z.object({
  milestone: z.string().describe('When it is due, e.g. "Advance on confirmation".'),
  percent: z.number().describe("Whole percent of the price."),
})

const term = z.object({
  label: z.string(),
  text: z.string(),
})

export const proposalDraftSchema = z.object({
  projectName: z.string(),
  tagline: z.string(),
  platforms: z.string(),
  summary: z.object({
    headline: z.string(),
    needs: z.array(needRow),
  }),
  scope: z.object({
    headline: z.string(),
    modules: z.array(scopeModule),
  }),
  howItWorks: z.object({
    headline: z.string(),
    flow: z.array(z.string()),
    stages: z.array(stage),
    roles: z.array(role),
    note: z.string(),
  }),
  timeline: z.object({
    headline: z.string(),
    phases: z.array(phase),
  }),
  commercials: z.object({
    includedItems: z.array(z.string()),
    paymentSchedule: z.array(milestone),
    exclusions: z.array(z.string()),
  }),
  terms: z.array(term),
})

export type ProposalDraft = z.infer<typeof proposalDraftSchema>
export type ProposalPhase = z.infer<typeof phase>
export type ProposalMilestone = z.infer<typeof milestone>

/**
 * Reads a stored draft back. Null when the JSON no longer fits the shape,
 * which the page reports instead of rendering half a proposal.
 */
export function parseStoredDraft(value: unknown): ProposalDraft | null {
  const parsed = proposalDraftSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
