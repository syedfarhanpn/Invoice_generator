"use client"

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Blocks,
  Briefcase,
  CalendarDays,
  FileText,
  LayoutGrid,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Settings,
  Sun,
  UsersRound,
  X,
} from "lucide-react"

import { logout } from "@/app/login/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { isNavItemActive, type NavMatch } from "@/lib/nav"
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme"
import { cn } from "@/lib/utils"
import { getPreference, getServerPreference, setPreference, subscribe } from "./theme-store"

/**
 * One shell for the whole product: a persistent rail on the left, a working
 * area on the right.
 *
 * It replaces both the invoicing header bar and the CRM's separate chrome.
 * There is no launcher and no notion of switching between apps - every
 * section is one click from every other, which is the point of a rail. The
 * rail is a single client component mounted by each route group's layout, so
 * the collapse state survives navigation within a tree and is restored from
 * storage across trees.
 */

type NavItem = NavMatch & {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}

type NavGroup = { label: string; items: NavItem[] }

const PRIMARY: NavItem = {
  href: "/dashboard",
  match: "/dashboard",
  exact: true,
  label: "Dashboard",
  icon: LayoutGrid,
}

const PAGES: NavItem[] = [
  { href: "/crm", match: "/crm", label: "Leads & CRM", icon: Briefcase },
  { href: "/dashboard/documents", match: "/dashboard/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/clients", match: "/dashboard/clients", label: "Clients", icon: UsersRound },
  { href: "/calendar", match: "/calendar", label: "Calendar", icon: CalendarDays },
]

const PREFERENCES: NavItem = {
  href: "/dashboard/settings/business",
  match: "/dashboard/settings",
  label: "Preferences",
  icon: Settings,
}

/** Operator-only. Hiding it is cosmetic - requireSuperAdmin() is the gate. */
const USERS: NavItem = {
  href: "/dashboard/admin",
  match: "/dashboard/admin",
  label: "Users",
  icon: Blocks,
}

function buildGroups(isSuperAdmin: boolean): NavGroup[] {
  return [
    { label: "Dashboard", items: [PRIMARY] },
    { label: "Pages", items: PAGES },
    { label: "Settings", items: isSuperAdmin ? [PREFERENCES, USERS] : [PREFERENCES] },
  ]
}

const COLLAPSE_KEY = "clientkit-rail-collapsed"

/** Two letters from the address, which is the only name we are given. */
function initials(email: string): string {
  const name = email.split("@")[0] ?? ""
  const parts = name.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || "?"
}

// ---------------------------------------------------------------------------

const THEME_ICON: Record<ThemePreference, React.ComponentType<{ className?: string }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const THEME_LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
}

/**
 * The header's theme control. Cycles rather than opening a menu: there are
 * three states and the icon always says which one you are in, so a menu would
 * be a click of ceremony around a one-click decision. The full radio group in
 * Preferences is still there for anyone who wants to see all three at once.
 */
function ThemeCycle() {
  const preference = useSyncExternalStore(subscribe, getPreference, getServerPreference)
  const Icon = THEME_ICON[preference]
  const next = THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length]

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      title={`Theme: ${THEME_LABEL[preference]}. Switch to ${THEME_LABEL[next]}.`}
      aria-label={`Theme: ${THEME_LABEL[preference]}. Switch to ${THEME_LABEL[next]}.`}
      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4.5" />
    </button>
  )
}

/**
 * Jump-to-page. It searches the rail rather than your data, which is what the
 * shell actually knows about - a box that promised to search invoices and
 * silently did not would be worse than no box.
 */
function NavSearch({ groups }: { groups: NavGroup[] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const all = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return all.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 6)
  }, [all, query])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const go = (href: string) => {
    setQuery("")
    setOpen(false)
    router.push(href)
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-xs">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
      />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, matches.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === "Enter" && matches[active]) {
            e.preventDefault()
            go(matches[active].href)
          } else if (e.key === "Escape") {
            setOpen(false)
          }
        }}
        placeholder="Type to search..."
        aria-label="Search pages"
        className="h-10 w-full rounded-xl border bg-card pr-3 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />

      {open && query.trim() !== "" && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No page matches that.</p>
          ) : (
            matches.map((item, i) => (
              <button
                key={item.href}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  i === active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg text-sm outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

export function AppShell({
  email,
  isSuperAdmin,
  children,
}: {
  email: string
  isSuperAdmin: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const groups = useMemo(() => buildGroups(isSuperAdmin), [isSuperAdmin])

  // Server and first client render must agree, so this starts false and the
  // stored value is adopted in an effect rather than during render.
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true)
    } catch {
      // Private mode: the rail just opens expanded every time.
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0")
      } catch {
        // Non-fatal: it applies now, it just will not be remembered.
      }
      return next
    })
  }

  // The overlay must not outlive the navigation that it triggered.
  useEffect(() => setMobileOpen(false), [pathname])

  const rail = (
    <>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-3",
          collapsed ? "justify-center px-0" : "px-4"
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
          <Blocks className="size-4.5" strokeWidth={2} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">Client Kit Studio</div>
            <div className="truncate text-xs text-muted-foreground">Invoicing &amp; CRM</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Sections">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && (
              <div className="px-3 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {group.label}
              </div>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isNavItemActive(pathname, item)}
                collapsed={collapsed}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className={cn("shrink-0 border-t border-sidebar-border p-3", collapsed && "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title={collapsed ? email : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  collapsed && "justify-center"
                )}
              />
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
              {initials(email)}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{email.split("@")[0]}</span>
                <span className="block truncate text-xs text-muted-foreground">{email}</span>
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <form action={logout}>
              <DropdownMenuItem
                variant="destructive"
                render={<button type="submit" className="w-full" />}
              >
                <LogOut className="mr-2 size-4" /> Sign out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop rail */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[68px]" : "w-65"
        )}
      >
        {rail}
      </aside>

      {/* Mobile rail: an overlay, so it never steals width from the content. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <aside className="absolute inset-y-0 left-0 flex w-65 flex-col border-r border-sidebar-border bg-sidebar">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute top-5 right-3 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            {rail}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4">
          <button
            type="button"
            onClick={() => {
              if (window.matchMedia("(min-width: 768px)").matches) toggleCollapsed()
              else setMobileOpen(true)
            }}
            aria-label="Toggle navigation"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelLeft className="size-4.5" strokeWidth={1.75} />
          </button>

          <NavSearch groups={groups} />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeCycle />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
