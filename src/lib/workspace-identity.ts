import { cache } from "react"

import { getCurrentUser, isSuperAdmin } from "@/lib/current-user"
import { displayNameFor } from "@/lib/members"
import prisma from "@/lib/db"

/**
 * Everything the shell needs about who is signed in and whose workspace this
 * is, in one memoized read.
 *
 * Both route groups mount the shell, so without this the business profile
 * would be fetched once per layout on every navigation that crosses between
 * them. React.cache scopes to a single request, so a new request always
 * re-reads - this shortens the query count, never the session check.
 */
export type WorkspaceIdentity = {
  userId: string
  /** The workspace this request acts in. Null before the org migration has
   *  run, or for an account that belongs to none. */
  orgId: string | null
  /** This person as a member of that workspace - what assignment points at. */
  membershipId: string | null
  email: string
  /** The person's own name, when the profile carries one. */
  displayName: string | null
  /** The company the workspace belongs to, shown as the product mark. */
  brandName: string
  /**
   * The logo uploaded in Settings - Business, when there is one.
   *
   * The same image the invoices carry, so the rail and the documents a client
   * receives show one mark rather than two. Null falls back to the built-in
   * glyph: an empty square where a logo should be reads as a broken page.
   */
  logoUrl: string | null
  isSuperAdmin: boolean
}

/** Shown before a business profile exists, rather than an empty rail. */
const FALLBACK_BRAND = "Pixie Webs"

export const getWorkspaceIdentity = cache(async (): Promise<WorkspaceIdentity> => {
  const user = await getCurrentUser()

  const [profile, membership] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { userId: user.id },
      select: { businessName: true, ownerName: true, logoUrl: true },
    }),
    prisma.membership.findFirst({
      where: { userId: user.id, status: { in: ["ACTIVE", "INVITED"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, orgId: true },
    }),
  ])

  return {
    userId: user.id,
    orgId: membership?.orgId ?? null,
    membershipId: membership?.id ?? null,
    email: user.email,
    displayName: displayNameFor({
      name: user.name,
      email: user.email,
      businessProfile: profile ? { ownerName: profile.ownerName } : null,
    }),
    brandName: profile?.businessName?.trim() || FALLBACK_BRAND,
    logoUrl: profile?.logoUrl?.trim() || null,
    isSuperAdmin: isSuperAdmin(user),
  }
})
