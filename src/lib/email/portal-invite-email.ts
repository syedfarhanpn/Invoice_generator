import { escapeHtml, type RenderedEmail } from "@/lib/email/invite-email"

/**
 * The invitation a client gets to their portal.
 *
 * Deliberately not the team invite template. A colleague is being told what
 * they may administer; a client is being told where to watch their own work.
 * Sharing one template would mean every change to either having to be safe
 * for both, and the first thing to go wrong would be a client being sent a
 * list of modules they can "manage".
 */

export type PortalInviteInput = {
  /** The agency doing the inviting. */
  brandName: string
  /** Who sent it. Null falls back to naming the company alone. */
  inviterName: string | null
  /** The client, as they are known. */
  clientName: string
  /** The address being invited, so a forwarded mail is unambiguous. */
  email: string
  /** Optional note typed by the sender. Plain text; escaped before use. */
  note: string | null
  /** The Supabase action link that sets up their password. */
  actionUrl: string
}

export function renderPortalInviteEmail(input: PortalInviteInput): RenderedEmail {
  const who = input.inviterName?.trim()
  const lead = who
    ? `${who} has set up a portal for ${input.clientName}`
    : `${input.brandName} has set up a portal for ${input.clientName}`

  const subject = `${input.brandName}: your client portal`

  const textLines = [
    lead + ".",
    "",
    "You can see, any time and without asking:",
    "  - Your projects and how far along each one is",
    "  - Your invoices, what is paid and what is outstanding",
    "  - Renewal dates for your domain, hosting and maintenance",
    "  - Any support tickets you have raised",
    "",
  ]
  if (input.note?.trim()) textLines.push(input.note.trim(), "")
  textLines.push(
    `Sign in with: ${input.email}`,
    "",
    "Set your password to get started:",
    input.actionUrl,
    "",
    "This link signs you in once and lets you choose a password. If you were not expecting this, you can ignore this email.",
    "",
    `Sent by ${input.brandName}.`
  )

  const esc = {
    brand: escapeHtml(input.brandName),
    lead: escapeHtml(lead),
    email: escapeHtml(input.email),
    note: input.note?.trim() ? escapeHtml(input.note.trim()) : null,
    url: escapeHtml(input.actionUrl),
  }

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
      <p style="margin:0 0 18px;font-size:15px;line-height:24px;color:#475569;">
        Set a password and you can check on your work any time, without having to ask.
      </p>

      ${
        esc.note
          ? `<div style="margin:0 0 20px;padding:14px 16px;background:#f8fafc;border-left:3px solid #94a3b8;border-radius:6px;">
        <p style="margin:0;font-size:14px;line-height:22px;color:#334155;white-space:pre-wrap;">${esc.note}</p>
      </div>`
          : ""
      }

      <div style="margin:0 0 22px;padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
        <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#0f172a;font-weight:600;">What you will see</p>
        <p style="margin:0 0 4px;font-size:14px;line-height:22px;color:#334155;">Your projects, and how far along each one is</p>
        <p style="margin:0 0 4px;font-size:14px;line-height:22px;color:#334155;">Your invoices, what is paid and what is outstanding</p>
        <p style="margin:0 0 4px;font-size:14px;line-height:22px;color:#334155;">Renewal dates for your domain, hosting and maintenance</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#334155;">Any support tickets you have raised</p>
        <p style="margin:0;font-size:14px;line-height:22px;color:#334155;"><strong style="color:#0f172a;">Sign in with:</strong> ${esc.email}</p>
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
