import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import prisma from "@/lib/db"
import { createClient } from "@/utils/supabase/server"

/**
 * Who is asking, on the portal side.
 *
 * This is a SECOND, separate identity path, and keeping it separate is the
 * whole design:
 *
 *  - A client has a Supabase auth account but NO workspace `User` row.
 *    getCurrentUser() refuses an account with no User row unless it is the
 *    bootstrap address, so a client signing in and typing /dashboard is
 *    turned away by machinery that already existed. The portal does not have
 *    to remember to check.
 *  - Equally, this never consults the User table, so an operator cannot
 *    wander into a client's portal just by being signed in. They have to be
 *    the account attached to that client row.
 *
 * Matching is on the auth uid, not the email. A client's contact address
 * changes often enough - and if it did, matching on email would hand their
 * projects and invoices to whoever inherited the mailbox.
 *
 * The first successful sign-in claims the account: `portalUserId` is written
 * then, keyed off the invited email, and from that point the email is no
 * longer consulted at all.
 */

export type PortalClient = {
  id: string
  userId: string
  name: string
  email: string
}

export const getPortalClient = cache(async (): Promise<PortalClient> => {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  // Locally verified claims rather than getUser(), for the same reason
  // getCurrentUser() uses them: the proxy already established this.
  const { data } = await supabase.auth.getClaims()
  const uid = data?.claims?.sub as string | undefined
  const email = (data?.claims?.email as string | undefined)?.toLowerCase().trim()

  if (!uid || !email) redirect("/login")

  // Already claimed: the uid is the only thing consulted.
  const claimed = await prisma.client.findUnique({
    where: { portalUserId: uid },
    select: { id: true, userId: true, fullName: true, businessName: true, email: true, archivedAt: true },
  })

  if (claimed) {
    if (claimed.archivedAt) await rejectPortal(supabase, "That portal is no longer active.")
    return {
      id: claimed.id,
      userId: claimed.userId,
      name: claimed.businessName || claimed.fullName,
      email: claimed.email,
    }
  }

  // Not claimed yet. An invitation is outstanding for this address, so this
  // sign-in is the acceptance - bind the account to the client row now.
  //
  // portalInvitedAt must be set: without it, anyone who creates a Supabase
  // account with an address that happens to match a client could claim that
  // client's portal. The invitation is what makes this safe.
  const invited = await prisma.client.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      portalInvitedAt: { not: null },
      portalUserId: null,
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, fullName: true, businessName: true, email: true },
  })

  if (!invited) {
    // Never returns - rejectPortal redirects - but TypeScript cannot see
    // that through the await, so the narrowing is spelled out.
    return rejectPortal(
      supabase,
      "This account does not have portal access. Ask your agency for an invitation."
    )
  }

  await prisma.client.update({
    where: { id: invited.id },
    data: { portalUserId: uid, portalEnabledAt: new Date() },
  })

  return {
    id: invited.id,
    userId: invited.userId,
    name: invited.businessName || invited.fullName,
    email: invited.email,
  }
})

/** Signs the session out and sends them back with a reason. */
async function rejectPortal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reason: string
): Promise<never> {
  await supabase.auth.signOut().catch(() => {})
  redirect(`/login?error=${encodeURIComponent(reason)}`)
}
