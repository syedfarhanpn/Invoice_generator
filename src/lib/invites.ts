import type { MemberRole } from "@prisma/client"

import { renderInviteEmail } from "@/lib/email/invite-email"
import { mailerConfigured, sendEmail } from "@/lib/email/mailer"
import { adminClientConfigured, createAdminClient } from "@/lib/supabase-admin"

/**
 * Turning an invitation into an account someone can actually sign in to.
 *
 * Two halves have to happen, and they belong to different systems:
 *
 *  - AUTHENTICATION is Supabase's. generateLink({ type: "invite" }) creates
 *    the auth user and returns a one-time link, WITHOUT sending Supabase's
 *    own email. That is the point: the operator wanted their own wording,
 *    from their own company, so we take the link and send it ourselves.
 *  - AUTHORIZATION is ours. The User and Membership rows are written by the
 *    caller before this runs; this function never touches them.
 *
 * The link lands on /auth/confirm, which already handles type=invite and
 * forwards to /auth/set-password. None of that needed building - it was
 * waiting for someone to generate a link and put it in front of a person.
 *
 * Nothing here throws. An invite whose email bounced is still a valid invite,
 * and the caller surfaces the link so the operator can send it by hand.
 */

export type InviteOutcome = {
  /** The one-time link, when one could be made. Shown as a fallback. */
  actionUrl: string | null
  /** Whether our branded email actually went out. */
  emailed: boolean
  /**
   * What to tell the operator. Null when everything worked, so the UI can
   * stay quiet on the happy path.
   */
  problem: string | null
}

export type InviteDetails = {
  email: string
  role: MemberRole
  title: string | null
  note: string | null
  brandName: string
  inviterName: string | null
  /** Replies go to the person who invited them, not into a void. */
  replyTo: string | null
}

/** Where the invite link should land. Falls back to the dev origin. */
function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/$/, "")
}

/**
 * Creates the auth user if needed, and emails them a branded invitation.
 *
 * Called after the membership is committed, deliberately outside the
 * transaction: a mail provider timing out must not roll back a member who is
 * now legitimately in the workspace.
 */
export async function sendWorkspaceInvite(details: InviteDetails): Promise<InviteOutcome> {
  if (!adminClientConfigured()) {
    return {
      actionUrl: null,
      emailed: false,
      problem:
        "They are in the workspace, but no sign-in link could be created: SUPABASE_SERVICE_ROLE_KEY is not set. Add it to the environment, then send the invitation again from their row.",
    }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { actionUrl: null, emailed: false, problem: "The Supabase admin client is unavailable." }
  }

  const redirectTo = `${siteUrl()}/auth/confirm`

  // "invite" creates the auth user. If they already have one - they were
  // invited before, or belong to another workspace - that call fails, and a
  // recovery link is the right thing instead: it proves the mailbox and lets
  // them set a password, which is all an invite link does anyway.
  let link = await generate(admin, "invite", details.email, redirectTo)
  if (!link.url) {
    const recovery = await generate(admin, "recovery", details.email, redirectTo)
    if (recovery.url) link = recovery
  }

  if (!link.url) {
    return {
      actionUrl: null,
      emailed: false,
      problem: link.error ?? "No sign-in link could be created for that address.",
    }
  }

  if (!mailerConfigured()) {
    return {
      actionUrl: link.url,
      emailed: false,
      problem:
        "Email is not set up, so nothing was sent. Copy the link below and send it to them yourself.",
    }
  }

  const { subject, html, text } = renderInviteEmail({
    brandName: details.brandName,
    inviterName: details.inviterName,
    email: details.email,
    role: details.role,
    title: details.title,
    note: details.note,
    actionUrl: link.url,
  })

  const sent = await sendEmail({
    to: details.email,
    subject,
    html,
    text,
    replyTo: details.replyTo,
  })

  if (!sent.ok) {
    return {
      actionUrl: link.url,
      emailed: false,
      problem: `${sent.message} The link below still works - send it to them yourself.`,
    }
  }

  return { actionUrl: link.url, emailed: true, problem: null }
}

type GeneratedLink = { url: string | null; error: string | null }

async function generate(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  type: "invite" | "recovery",
  email: string,
  redirectTo: string
): Promise<GeneratedLink> {
  const { data, error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo },
  })
  if (error) return { url: null, error: error.message }
  return { url: data?.properties?.action_link ?? null, error: null }
}
