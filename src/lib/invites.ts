import type { MemberRole } from "@prisma/client"

import { renderInviteEmail } from "@/lib/email/invite-email"
import { renderPortalInviteEmail } from "@/lib/email/portal-invite-email"
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

/**
 * A link that lands on our own /auth/confirm, carrying the token to verify.
 *
 * NOT `properties.action_link`, which is the obvious thing to use and is
 * wrong here. That one points at Supabase's own /auth/v1/verify, and after
 * Supabase checks the token it bounces to redirect_to with the session in
 * the URL FRAGMENT (#access_token=...). A fragment is never sent to the
 * server, so our route handler saw a bare URL with no query at all and said
 * "That link is not valid" - which is exactly what it should say when handed
 * nothing, and exactly the wrong outcome for a perfectly good invite.
 *
 * `properties.hashed_token` is the same token in the form verifyOtp() takes,
 * so pointing straight at our route lets it do the verification server-side.
 * That is the style /auth/confirm was written to prefer, and its own comment
 * says why: the secret never reaches the browser.
 */
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

  const tokenHash = data?.properties?.hashed_token
  if (tokenHash) {
    const url = new URL(redirectTo)
    url.searchParams.set("token_hash", tokenHash)
    url.searchParams.set("type", type)
    return { url: url.toString(), error: null }
  }

  // Nothing to verify with. The provider link is a worse experience but is
  // better than handing the operator nothing at all.
  return { url: data?.properties?.action_link ?? null, error: null }
}

/**
 * Invites a CLIENT to their portal.
 *
 * Shares the link machinery with the team invite and nothing else. The
 * account it creates is a Supabase auth user with no workspace `User` row,
 * which is what keeps a client out of the dashboard: getCurrentUser() is
 * fail closed and refuses an account it has no User row for.
 *
 * The redirect lands on /auth/confirm like every other auth email, which
 * forwards to /auth/set-password. From there the client signs in and
 * lib/portal-auth.ts binds the account to their client row.
 */
export async function sendPortalInvite(details: {
  email: string
  clientName: string
  note: string | null
  brandName: string
  inviterName: string | null
  replyTo: string | null
}): Promise<InviteOutcome> {
  if (!adminClientConfigured()) {
    return {
      actionUrl: null,
      emailed: false,
      problem:
        "No sign-in link could be created: SUPABASE_SERVICE_ROLE_KEY is not set. Add it to the environment, then invite them again.",
    }
  }

  const admin = createAdminClient()
  if (!admin) {
    return { actionUrl: null, emailed: false, problem: "The Supabase admin client is unavailable." }
  }

  const redirectTo = `${siteUrl()}/auth/confirm`

  // "invite" creates the auth user. An address that already has one - a
  // client who was invited before, or who is also a team member elsewhere -
  // fails that call, and a recovery link does the same job: it proves the
  // mailbox and lets them set a password.
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

  const { subject, html, text } = renderPortalInviteEmail({
    brandName: details.brandName,
    inviterName: details.inviterName,
    clientName: details.clientName,
    email: details.email,
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
