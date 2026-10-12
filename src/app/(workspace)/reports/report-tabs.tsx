"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

/**
 * Moving between reports without losing the period you were looking at.
 *
 * The range lives in the query string, so every tab carries it across. Dropping
 * it would mean clicking from a quarter-long revenue report into a clients
 * report silently showing the last thirty days, and the two would be read as
 * though they described the same period.
 */

const TABS = [
  { href: "/reports", label: "Overview" },
  { href: "/reports/sales", label: "Sales & Leads" },
  { href: "/reports/clients", label: "Clients" },
  { href: "/reports/projects", label: "Projects" },
  { href: "/reports/expenses", label: "Expenses" },
  { href: "/reports/renewals", label: "Renewals" },
]

export function ReportTabs() {
  const pathname = usePathname()
  const params = useSearchParams()
  const query = params.toString()

  return (
    <nav aria-label="Reports" className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5">
      {TABS.map((tab) => {
        // Exact for the overview, prefix for the rest - otherwise /reports
        // would light up on every child page.
        const active = tab.href === "/reports" ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={query ? `${tab.href}?${query}` : tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
