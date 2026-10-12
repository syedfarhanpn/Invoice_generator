"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { isNavItemActive } from "@/lib/nav"
import { cn } from "@/lib/utils"

/**
 * Settings navigation.
 *
 * Grouped rather than a flat strip, because Settings is now several unrelated
 * jobs: what the business is, how its documents look and behave, how the
 * boards are shaped, and who can get in. One long page of stacked cards made
 * all of those look like the same task.
 *
 * Team members, roles and permissions are deliberately NOT here. They live in
 * Team Management, and having one place to look is the point.
 */

const GROUPS: { label: string; items: { href: string; match: string; label: string }[] }[] = [
  {
    label: "Company",
    items: [
      {
        href: "/dashboard/settings/business",
        match: "/dashboard/settings/business",
        label: "Profile & documents",
      },
    ],
  },
  {
    label: "Workflow",
    items: [
      {
        href: "/dashboard/settings/boards",
        match: "/dashboard/settings/boards",
        label: "Board columns",
      },
    ],
  },
  {
    label: "Preferences",
    items: [
      {
        href: "/dashboard/settings/appearance",
        match: "/dashboard/settings/appearance",
        label: "Appearance",
      },
    ],
  },
  {
    label: "Security & access",
    items: [
      {
        href: "/dashboard/settings/security",
        match: "/dashboard/settings/security",
        label: "Password & API keys",
      },
    ],
  },
]

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings sections" className="space-y-4">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, item)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
