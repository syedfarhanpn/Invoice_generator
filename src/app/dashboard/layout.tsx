import { AppShell } from "@/components/app/app-shell"
import { getCurrentUser, isSuperAdmin } from "@/lib/current-user"

/**
 * The invoicing tree, inside the one shell the whole product wears.
 *
 * This awaits the current user rather than streaming the nav around it, as
 * the old header bar did. That cost nothing: getCurrentUser() is memoized per
 * request and every page below already awaits it, so the query runs once
 * either way - this only moves it earlier, and the rail is useless without
 * knowing whether to show the operator link.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <AppShell email={user.email} isSuperAdmin={isSuperAdmin(user)}>
      <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">{children}</div>
    </AppShell>
  )
}
