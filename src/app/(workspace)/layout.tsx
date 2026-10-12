import { AppShell } from "@/components/app/app-shell"
import { viewerMatrix } from "@/lib/access"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

/**
 * The CRM, projects, tasks and calendar tree, in the same shell as everything
 * else.
 *
 * It stays a separate route group only so these pages can own their full
 * height and their own scrolling - they are single-screen tools rather than
 * documents, so the shell does not wrap them in page padding.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [identity, matrix] = await Promise.all([getWorkspaceIdentity(), viewerMatrix()])

  return (
    <AppShell
      email={identity.email}
      displayName={identity.displayName}
      brandName={identity.brandName}
      logoUrl={identity.logoUrl}
      isSuperAdmin={identity.isSuperAdmin}
      matrix={matrix}
    >
      {children}
    </AppShell>
  )
}
