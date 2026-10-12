/**
 * Sending email.
 *
 * Over Resend's REST API with plain fetch rather than their SDK: it is one
 * POST, and a dependency that wraps one POST is a dependency to keep patched
 * for no gain. Swapping provider means changing this file and nothing else -
 * every caller sees only sendEmail().
 *
 * RESEND_API_KEY and EMAIL_FROM are read at call time, not at import time, so
 * the app still boots and every other page still works when they are unset.
 * An unconfigured mailer is a normal state here, not a crash: the invite flow
 * falls back to showing a copyable link.
 */

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
  /** Where a reply should go - the inviter, not the no-reply sender. */
  replyTo?: string | null
}

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not-configured" | "failed"; message: string }

/** Whether a send would even be attempted. The UI asks before promising. */
export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.EMAIL_FROM?.trim()

  if (!apiKey || !from) {
    return {
      ok: false,
      reason: "not-configured",
      message:
        "Email is not set up yet. Add RESEND_API_KEY and EMAIL_FROM to the environment to send from the app.",
    }
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    })

    if (!response.ok) {
      // Read the provider's own words - "domain not verified" is the single
      // most common failure and is worth passing through verbatim, because
      // no message we invent would tell the operator what to go and fix.
      const body = await response.text().catch(() => "")
      return {
        ok: false,
        reason: "failed",
        message: summariseFailure(response.status, body),
      }
    }

    const data = (await response.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: data?.id ?? null }
  } catch (cause) {
    return {
      ok: false,
      reason: "failed",
      message: cause instanceof Error ? cause.message : "The email could not be sent.",
    }
  }
}

/** The provider's error, trimmed to something that fits in a dialog. */
function summariseFailure(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; name?: string }
    if (parsed.message) return parsed.message
  } catch {
    // Not JSON - fall through to the status line.
  }
  return `The mail provider refused the message (HTTP ${status}).`
}
