import { AppShell } from "@/components/app/app-shell"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

/**
 * The invoicing tree, inside the one shell the whole product wears.
 *
 * This awaits the identity rather than streaming the rail around it: the
 * underlying reads are memoized per request and every page below already
 * awaits the user, so the queries run once either way. This only moves them
 * earlier, and the rail cannot be drawn without knowing which links to show.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const identity = await getWorkspaceIdentity()

  return (
    <AppShell
      email={identity.email}
      displayName={identity.displayName}
      brandName={identity.brandName}
      isSuperAdmin={identity.isSuperAdmin}
    >
      <div className="flex flex-1 flex-col gap-5 p-4 md:p-6">{children}</div>
    </AppShell>
  )
}
