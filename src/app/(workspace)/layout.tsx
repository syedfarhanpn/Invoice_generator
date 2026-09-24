import { AppShell } from "@/components/app/app-shell"
import { getCurrentUser, isSuperAdmin } from "@/lib/current-user"

/**
 * The CRM and calendar tree, in the same shell as everything else.
 *
 * It stays a separate route group only so these pages can own their full
 * height and scrolling - they are single-screen tools, not documents. The
 * chrome is identical, so crossing between here and invoicing looks like one
 * app, which it now is.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  return (
    <AppShell email={user.email} isSuperAdmin={isSuperAdmin(user)}>
      {children}
    </AppShell>
  )
}
