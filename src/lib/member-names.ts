/**
 * What to call someone, and how to abbreviate it.
 *
 * Pure and prisma-free on purpose: the shell renders names in a Client
 * Component, and importing these from the module that queries the database
 * would pull the Prisma client into the browser bundle.
 *
 * These were derived independently in four places - the shell header, the
 * assignment dropdown, the workload list and the project card - so the same
 * person read as "Syed Farhan PN" in one and "syedfarhanpn" in another.
 */

export type NameSource = {
  name: string | null
  email: string
  businessProfile?: { ownerName: string | null } | null
}

export function displayNameFor(user: NameSource): string {
  return (
    user.name?.trim() || user.businessProfile?.ownerName?.trim() || user.email.split("@")[0]
  )
}

/** Two letters, from a name when there is one and the address otherwise. */
export function memberInitials(name: string): string {
  const base = (name.includes("@") ? name.split("@")[0] : name).trim()
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase() || "?"
}
