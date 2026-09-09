/**
 * Settings is a single page now - Appearance, Security and API keys were
 * folded into it, so there are no sections left to navigate between.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6">{children}</div>
}
