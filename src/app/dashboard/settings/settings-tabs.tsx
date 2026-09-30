"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { isNavItemActive } from "@/lib/nav"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/dashboard/settings/business", match: "/dashboard/settings/business", label: "Business" },
  { href: "/dashboard/settings/boards", match: "/dashboard/settings/boards", label: "Board columns" },
]

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings sections" className="flex items-center gap-1 border-b">
      {TABS.map((tab) => {
        const active = isNavItemActive(pathname, tab)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // The underline sits on the element rather than a pseudo-element
              // so it lines up with the container's own border.
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
