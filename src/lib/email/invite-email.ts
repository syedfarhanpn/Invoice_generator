import type { MemberRole } from "@prisma/client"

import { ROLE_LABEL } from "@/lib/members"
import { MODULE_LABEL, MODULES, ROLE_DEFAULTS, type Module } from "@/lib/permissions"

/**
 * The invitation email.
 *
 * Pure: it takes facts and returns a subject and a body, so the wording can be
 * tested without a mail provider, a database or a network. Sending lives in
 * mailer.ts and the orchestration in lib/invites.ts.
 *
 * Three things it must get right, in order:
 *
 *  - The link. Everything else is decoration; an invite whose button does not
 *    work is a wasted email and a confused colleague.
 *  - Who it is from. It is sent on behalf of a company to someone who knows
 *    that company, not from "Pixie Webs LLP via some SaaS" - so the brand
 *    name leads the subject and the greeting names the person inviting them.
 *  - What they will be able to do. Derived from ROLE_DEFAULTS rather than
 *    written by hand, so the email cannot promise access the product will not
 *    grant. If an operator has overridden the role's defaults the member sees
 *    the override when they sign in; the email says what the ROLE means,
 *    which is what the invite is actually offering.
 *
 * HTML is inline-styled and table-free by design. Gmail strips <style> blocks,
 * Outlook ignores most flexbox, and a plain stack of divs with inline styles
 * is the one thing every client renders the same.
 */

export type InviteEmailInput = {
  /** The company doing the inviting - their business profile name. */
  brandName: string
  /** Who sent it. Null falls back to naming the company alone. */
  inviterName: string | null
  /** The address being invited, shown so a forwarded mail is unambiguous. */
  email: string
  role: MemberRole
  /** Job title, when one was set. Shown beside the role. */
  title: string | null
  /** Optional note typed by the inviter. Plain text; escaped before use. */
  note: string | null
  /** The Supabase action link that sets up their password. */
  actionUrl: string
}

export type RenderedEmail = { subject: string; html: string; text: string }

/** Escapes text that came from a human before it goes near HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * What this role can reach, in plain words, newest-permission-model first.
 *
 * Write and read are kept apart because they are a real difference to the
 * person reading: "you can edit Projects but only look at Documents" sets an
 * expectation that matches what they will find.
 */
export function roleCapabilities(role: MemberRole): { canEdit: string[]; canView: string[] } {
  const matrix = ROLE_DEFAULTS[role]
  const canEdit: string[] = []
  const canView: string[] = []

  for (const moduleKey of MODULES as readonly Module[]) {
    const access = matrix[moduleKey]
    if (access === "write") canEdit.push(MODULE_LABEL[moduleKey])
    else if (access === "read") canView.push(MODULE_LABEL[moduleKey])
  }

  return { canEdit, canView }
}

/** "Priya has invited you" / "You have been invited" when we have no name. */
function invitedBy(inviterName: string | null, brandName: string): string {
  const who = inviterName?.trim()
  return who ? `${who} has invited you to join ${brandName}` : `You have been invited to join ${brandName}`
}

function sentence(items: string[]): string {
  if (items.length === 0) return ""
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

export function renderInviteEmail(input: InviteEmailInput): RenderedEmail {
  const roleLabel = ROLE_LABEL[input.role]
  const { canEdit, canView } = roleCapabilities(input.role)
  const lead = invitedBy(input.inviterName, input.brandName)
  const titleLine = input.title?.trim()
    ? `${input.title.trim()} · ${roleLabel}`
    : roleLabel

  const subject = `${input.brandName}: your invitation to join as ${roleLabel}`

  // --- plain text ---------------------------------------------------------
  // Sent alongside the HTML, not as an afterthought: some clients show it,
  // and a spam filter that sees only HTML scores the message worse.
  const textLines = [
    lead + ".",
    "",
    `Role: ${titleLine}`,
    `Sign in with: ${input.email}`,
    "",
  ]
  if (input.note?.trim()) {
    textLines.push(input.note.trim(), "")
  }
  if (canEdit.length > 0) textLines.push(`You will be able to manage ${sentence(canEdit)}.`)
  if (canView.length > 0) textLines.push(`You will be able to view ${sentence(canView)}.`)
  if (canEdit.length > 0 || canView.length > 0) textLines.push("")
  textLines.push(
    "Set your password to get started:",
    input.actionUrl,
    "",
    "This link signs you in once and lets you choose a password. If you were not expecting this, you can ignore this email.",
    "",
    `Sent by ${input.brandName}.`
  )

  // --- html ---------------------------------------------------------------
  const esc = {
    brand: escapeHtml(input.brandName),
    lead: escapeHtml(lead),
    email: escapeHtml(input.email),
    title: escapeHtml(titleLine),
    note: input.note?.trim() ? escapeHtml(input.note.trim()) : null,
    url: escapeHtml(input.actionUrl),
  }

  const accessRows = [
    canEdit.length > 0
      ? `<p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#334155;"><strong style="color:#0f172a;">Can manage:</strong> ${escapeHtml(sentence(canEdit))}</p>`
      : "",
    canView.length > 0
      ? `<p style="margin:0;font-size:14px;line-height:22px;color:#334155;"><strong style="color:#0f172a;">Can view:</strong> ${escapeHtml(sentence(canView))}</p>`
      : "",
  ]
    .filter(Boolean)
    .join("")

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc.brand}</title></head>
<body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <div style="padding:22px 28px;border-bottom:1px solid #e2e8f0;">
      <div style="font-size:16px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">${esc.brand}</div>
    </div>

    <div style="padding:28px;">
      <h1 style="margin:0 0 10px;font-size:21px;line-height:30px;font-weight:650;color:#0f172a;letter-spacing:-0.01em;">${esc.lead}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#475569;">
        Set a password and you are in. Your workspace is already waiting.
      </p>

      ${
        esc.note
          ? `<div style="margin:0 0 20px;padding:14px 16px;background:#f8fafc;border-left:3px solid #94a3b8;border-radius:6px;">
        <p style="margin:0;font-size:14px;line-height:22px;color:#334155;white-space:pre-wrap;">${esc.note}</p>
      </div>`
          : ""
      }

      <div style="margin:0 0 22px;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#334155;"><strong style="color:#0f172a;">Role:</strong> ${esc.title}</p>
        <p style="margin:0 0 ${accessRows ? "12px" : "0"};font-size:14px;line-height:22px;color:#334155;"><strong style="color:#0f172a;">Sign in with:</strong> ${esc.email}</p>
        ${accessRows}
      </div>

      <a href="${esc.url}" style="display:inline-block;padding:12px 22px;background:#0f172a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:9px;">Set your password</a>

      <p style="margin:22px 0 0;font-size:13px;line-height:21px;color:#64748b;">
        Or paste this into your browser:<br>
        <span style="color:#475569;word-break:break-all;">${esc.url}</span>
      </p>

      <p style="margin:18px 0 0;font-size:13px;line-height:21px;color:#94a3b8;">
        This link signs you in once and lets you choose a password. If you were not expecting this, you can ignore this email.
      </p>
    </div>

    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:12px;line-height:20px;color:#94a3b8;">Sent by ${esc.brand}.</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html, text: textLines.join("\n") }
}
