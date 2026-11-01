import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"

import { proposalDraftSchema, type ProposalDraft } from "./draft"
import { PROPOSAL_SYSTEM_PROMPT } from "./prompt"

/**
 * The one call to Claude.
 *
 * Server-only: it reads ANTHROPIC_API_KEY, which must never reach the browser.
 * Nothing imports this from a client component - the actions that call it run
 * on the server and return only the saved proposal's id.
 *
 * Structured output, so what comes back is the draft's shape or an error -
 * never prose that has to be scraped. Streamed, because a proposal is a few
 * thousand tokens and a plain request that long can hit the HTTP timeout;
 * finalMessage() just waits for the end.
 */

export const PROPOSAL_MODEL = "claude-opus-5-5"

/** A failure worth showing the operator as written. */
export class ProposalWriterError extends Error {}

export function proposalWriterConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

let client: Anthropic | null = null

function anthropic(): Anthropic {
  // Five minutes, in milliseconds. A proposal takes about a minute; this is
  // the ceiling, matching the page's maxDuration.
  client ??= new Anthropic({ timeout: 5 * 60 * 1000, maxRetries: 2 })
  return client
}

export async function writeProposal(userMessage: string): Promise<{ draft: ProposalDraft; model: string }> {
  if (!proposalWriterConfigured()) {
    throw new ProposalWriterError(
      "Claude is not connected yet. Add ANTHROPIC_API_KEY to the server's environment, restart, and try again."
    )
  }

  try {
    const stream = anthropic().beta.messages.stream({
      model: PROPOSAL_MODEL,
      max_tokens: 32000,
      // If a safety classifier declines the request, the API retries it on
      // the fallback model Anthropic recommends, inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        // Medium keeps a proposal to about a minute. Writing to a fixed
        // structure from a brief does not need the deeper settings.
        effort: "medium",
        format: betaZodOutputFormat(proposalDraftSchema),
      },
      // Fixed text, so repeat requests (a revision straight after a draft)
      // read it from the prompt cache.
      system: [{ type: "text", text: PROPOSAL_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    })

    const message = await stream.finalMessage()

    if (message.stop_reason === "refusal") {
      throw new ProposalWriterError(
        "Claude declined to write this one. Rephrase the project description and try again."
      )
    }
    if (message.stop_reason === "max_tokens") {
      throw new ProposalWriterError(
        "The proposal came out too long to finish. Shorten the description or split the project, then try again."
      )
    }
    if (!message.parsed_output) {
      throw new ProposalWriterError("Claude's reply could not be read as a proposal. Try again.")
    }

    return { draft: message.parsed_output, model: message.model }
  } catch (error) {
    if (error instanceof ProposalWriterError) throw error
    // Most specific first. Each says what to do, not what went wrong inside.
    if (error instanceof Anthropic.AuthenticationError) {
      throw new ProposalWriterError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY and restart.")
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      throw new ProposalWriterError("This Anthropic API key is not allowed to use Claude Opus 5.5.")
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ProposalWriterError("Claude is busy for this account right now. Wait a minute and try again.")
    }
    if (error instanceof Anthropic.BadRequestError) {
      // Anthropic's own message, e.g. a low credit balance. It never echoes
      // the key, so it is safe to show.
      throw new ProposalWriterError(`Anthropic refused the request: ${error.message}`)
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new ProposalWriterError("Could not reach Anthropic. Check the server's connection and try again.")
    }
    if (error instanceof Anthropic.APIError) {
      throw new ProposalWriterError(`Anthropic is having trouble (status ${error.status}). Try again shortly.`)
    }
    throw error
  }
}
