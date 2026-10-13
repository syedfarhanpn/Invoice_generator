import { cache } from "react"

import { getViewer } from "@/lib/access"
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

  // The membership comes from getViewer() rather than a second query for the
  // same row. Every gated page calls requirePermission(), which calls
  // getViewer(), and then calls this - so the two were reading the same
  // Membership twice per request, on sixteen pages.
  //
  // Both are React.cache'd, so this is one round trip now and still re-reads
  // on a new request. The status filter is kept exactly as it was: getViewer
  // also admits SUSPENDED, and a suspended member had no identity here
  // before. Widening that silently is not an optimisation.
  const [profile, viewer] = await Promise.all([
    prisma.businessProfile.findUnique({
      where: { userId: user.id },
      select: { businessName: true, ownerName: true, logoUrl: true },
    }),
    getViewer(),
  ])

  const inWorkspace = viewer.status === "ACTIVE" || viewer.status === "INVITED"

  return {
    userId: user.id,
    orgId: inWorkspace ? viewer.orgId : null,
    membershipId: inWorkspace ? viewer.membershipId : null,
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
