"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { isNavItemActive, type NavMatch } from "@/lib/nav"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LayoutDashboard, FileText, Users, Settings, Menu, ShieldCheck } from "lucide-react"

type NavItem = NavMatch & {
  /** Where the link goes - not always the same as `match` (Settings links
   *  straight to /business but lights up for any settings page). */
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const BASE_ITEMS: NavItem[] = [
  { href: "/dashboard", match: "/dashboard", exact: true, label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/documents", match: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/clients", match: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/settings/business", match: "/dashboard/settings", label: "Settings", icon: Settings },
]

/** Operator-only. Hiding it is cosmetic - the route itself is guarded by
 *  requireSuperAdmin(), which is what actually enforces access. */
const ADMIN_ITEM: NavItem = {
  href: "/dashboard/admin",
  match: "/dashboard/admin",
  label: "Accounts",
  icon: ShieldCheck,
}

export function DashboardNav({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname()
  const NAV_ITEMS = isSuperAdmin ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS

  return (
    <>
      {/* Mobile: burger menu */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation menu">
              <Menu />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-56 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item)
            return (
              <DropdownMenuItem
                key={item.href}
                className={cn("gap-2 px-2 py-1.5", active && "bg-muted text-foreground font-medium")}
                render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
              >
                <item.icon className="size-4" />
                {item.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Desktop: inline tabs */}
      <nav className="hidden md:flex md:flex-row md:items-center md:gap-1 md:text-sm">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors",
                active
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
