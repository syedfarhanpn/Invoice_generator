"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { isNavItemActive, type NavMatch } from "@/lib/nav"

const SECTIONS: (NavMatch & { href: string; label: string })[] = [
  { href: "/dashboard/settings/business", match: "/dashboard/settings/business", label: "Business" },
  { href: "/dashboard/settings/appearance", match: "/dashboard/settings/appearance", label: "Appearance" },
  { href: "/dashboard/settings/security", match: "/dashboard/settings/security", label: "Security" },
  { href: "/dashboard/settings/api-keys", match: "/dashboard/settings/api-keys", label: "API keys" },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-px" aria-label="Settings sections">
      {SECTIONS.map((section) => {
        const active = isNavItemActive(pathname, section)
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {section.label}
          </Link>
        )
      })}
    </nav>
  )
}
