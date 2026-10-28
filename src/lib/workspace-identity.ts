import { cache } from "react"

import { getViewer } from "@/lib/access"
import { getCurrentUser, isSuperAdmin } from "@/lib/current-user"
import { displayNameFor } from "@/lib/members"
import prisma from "@/lib/db"

/**
 * Who is signed in, and whose workspace this is - which are two different
 * questions, and conflating them is what kept a team from sharing anything.
 *
 * Every row in this product carries a `userId`. That column has always meant
 * "which workspace this belongs to", not "who typed it": the business
 * profile, the document numbering sequences and the per-client codes all hang
 * off it. But each signed-in person resolved it to THEMSELVES, so an invited
 * colleague opened a perfectly working app onto an empty database - their own
 * workspace, containing nothing.
 *
 * So:
 *
 *   workspaceId  - whose DATA. The owner's id, the same for everyone in the
 *                  organisation. Every query that reads or writes business
 *                  records scopes by this.
 *   actorId      - who is DOING it. Audit trails, last-login, authorship.
 *                  Never a data filter.
 *
 * `userId` is kept as an alias of workspaceId so the fourteen pages already
 * scoping by it needed no change, and so the name still matches the column.
 *
 * Resolving the owner rather than migrating every row to `orgId` is the
 * deliberate choice: `userId` is load-bearing in unique constraints
 * (userId+refNumber, userId+code) and in the sequence counters on User, so
 * moving the scope to orgId would mean reworking document numbering at the
 * same time as sharing. This changes who the id resolves to and nothing else.
 */
export type WorkspaceIdentity = {
  /** Whose data. The workspace owner's id - shared by every member. */
  workspaceId: string
  /** Alias of workspaceId. Still named for the column it filters. */
  userId: string
  /** Who is actually signed in. For audit and authorship, never filtering. */
  actorId: string
  /** The workspace this request acts in. Null for an account in none. */
  orgId: string | null
  /** This person as a member of that workspace - what assignment points at. */
  membershipId: string | null
  /** The signed-in person's address. */
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

/**
 * The id every record in this workspace hangs off: the OWNER's.
 *
 * Cached per request because several callers want it. Falls back to the
 * signed-in user when there is no owner to find - which is the safe way to
 * fail, because it restores exactly the old behaviour (you see your own
 * workspace) rather than showing somebody else's.
 */
const resolveWorkspaceId = cache(async (orgId: string | null, fallback: string) => {
  if (!orgId) return fallback

  const owner = await prisma.membership.findFirst({
    where: { orgId, role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  })

  return owner?.userId ?? fallback
})

export const getWorkspaceIdentity = cache(async (): Promise<WorkspaceIdentity> => {
  const user = await getCurrentUser()

  // The membership comes from getViewer() rather than a second query for the
  // same row. Every gated page calls requirePermission(), which calls
  // getViewer(), and then calls this - so the two were reading the same
  // Membership twice per request, on sixteen pages.
  const viewer = await getViewer()

  const inWorkspace = viewer.status === "ACTIVE" || viewer.status === "INVITED"
  const orgId = inWorkspace ? viewer.orgId : null
  const workspaceId = await resolveWorkspaceId(orgId, user.id)

  // The brand, the logo and the currency belong to the WORKSPACE, so they are
  // read against the owner. A colleague opening the app should see the
  // company's mark, not a blank one because they have no profile of their own.
  const profile = await prisma.businessProfile.findUnique({
    where: { userId: workspaceId },
    select: { businessName: true, ownerName: true, logoUrl: true },
  })

  return {
    workspaceId,
    userId: workspaceId,
    actorId: user.id,
    orgId,
    membershipId: inWorkspace ? viewer.membershipId : null,
    email: user.email,
    displayName: displayNameFor({
      name: user.name,
      email: user.email,
      // Deliberately NOT the workspace profile's ownerName: that is the
      // owner's name, and showing it to a colleague would greet them as
      // somebody else.
      businessProfile: null,
    }),
    brandName: profile?.businessName?.trim() || FALLBACK_BRAND,
    logoUrl: profile?.logoUrl?.trim() || null,
    isSuperAdmin: isSuperAdmin(user),
  }
})
