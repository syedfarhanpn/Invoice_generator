import { SettingsNav } from "@/components/app/settings-nav"

/**
 * Deliberately touches no runtime data, so the route-level loading.tsx
 * skeletons under settings still stream instead of the whole navigation
 * blocking on a session read.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <SettingsNav />
      {children}
    </div>
  )
}
