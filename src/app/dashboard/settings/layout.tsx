import { SettingsTabs } from "./settings-tabs"

/**
 * Settings used to be a single page. It grew a second one when the boards
 * became configurable, so it grows a tab strip rather than burying columns at
 * the bottom of the business profile - they are different jobs done on
 * different days.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <SettingsTabs />
      {children}
    </div>
  )
}
