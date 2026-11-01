import { CircleAlert } from "lucide-react"

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

export function ClaudeKeyNotice() {
  return (
    <SetupNotice title="Claude is not connected yet">
      Add <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ANTHROPIC_API_KEY</code> to the server&apos;s
      environment (<code className="font-mono text-xs">.env</code> locally, and your host&apos;s settings in
      production), then restart. Existing proposals still open and download without it.
    </SetupNotice>
  )
}
