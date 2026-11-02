import { CircleAlert } from "lucide-react"
import Link from "next/link"

/**
 * Shown in place of a proposal page while something it needs is missing -
 * the database table, or the Anthropic key. Says what to do, not just that
 * something is wrong.
 */
export function SetupNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-tone-warning" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}

export function MigrationNotice() {
  return (
    <SetupNotice title="Proposals need a one-time database update">
      Run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npm run db:migrate</code> in the project
      folder, then reload this page. It adds the proposals table and changes nothing that already exists.
    </SetupNotice>
  )
}

/**
 * Each company writes proposals on its own Anthropic account, so the fix is
 * theirs to make - and only an owner or admin can, so everyone else is told
 * who to ask rather than sent to a page they cannot change.
 */
export function ClaudeKeyNotice({ canManage }: { canManage: boolean }) {
  return (
    <SetupNotice title="Claude is not connected for your company">
      {canManage ? (
        <>
          Add your company&apos;s Anthropic API key in{" "}
          <Link
            href="/dashboard/settings/integrations"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Settings - Integrations
          </Link>
          . Proposals are then written, and billed, on your own Anthropic account.
        </>
      ) : (
        <>Ask your company&apos;s owner or an admin to connect Claude in Settings - Integrations.</>
      )}{" "}
      Existing proposals still open and download without it.
    </SetupNotice>
  )
}
