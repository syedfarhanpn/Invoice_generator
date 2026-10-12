import { SettingsTabs } from "./settings-tabs"

/**
 * Settings is configuration, and nothing else.
 *
 * It began as one page, grew a tab, and by the time it held the business
 * profile, invoice defaults, document appearance, the theme, passwords and
 * API keys it was a single scroll of unrelated cards. Now the sections are
 * grouped and the navigation sits beside them, so finding one setting does
 * not mean reading past eight others.
 *
 * Team members, roles and permissions are not here. They are in Team
 * Management - see the note in settings-tabs.tsx.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How this workspace is configured. People and permissions live under Team Management.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <SettingsTabs />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
