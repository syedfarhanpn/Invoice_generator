import { cache } from "react"

import { getCurrentUser, isSuperAdmin } from "@/lib/current-user"
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
  email: string
  /** The person's own name, when the profile carries one. */
  displayName: string | null
  /** The company the workspace belongs to, shown as the product mark. */
  brandName: string
  isSuperAdmin: boolean
}

/** Shown before a business profile exists, rather than an empty rail. */
const FALLBACK_BRAND = "Pixie Webs"

export const getWorkspaceIdentity = cache(async (): Promise<WorkspaceIdentity> => {
  const user = await getCurrentUser()

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: user.id },
    select: { businessName: true, ownerName: true },
  })

  return {
    userId: user.id,
    email: user.email,
    displayName: user.name?.trim() || profile?.ownerName?.trim() || null,
    brandName: profile?.businessName?.trim() || FALLBACK_BRAND,
    isSuperAdmin: isSuperAdmin(user),
  }
})
