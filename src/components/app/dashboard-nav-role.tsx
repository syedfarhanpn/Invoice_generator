import { getCurrentUser, isSuperAdmin } from "@/lib/current-user"
import { DashboardNav } from "./dashboard-nav"

/**
 * Resolves the viewer's role for the nav.
 *
 * This is the only runtime data the dashboard layout touches, so it is
 * isolated here and rendered inside a <Suspense> boundary. Awaiting it in the
 * layout itself would block every navigation until the session resolved, and
 * would stop the route-level loading.tsx skeletons from ever showing (see the
 * layout.js caveats in the Next.js docs).
 */
export default async function DashboardNavWithRole() {
  const user = await getCurrentUser()
  return <DashboardNav isSuperAdmin={isSuperAdmin(user)} />
}
