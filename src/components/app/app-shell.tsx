"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Briefcase,
  CalendarDays,
  ChevronsLeft,
  FileText,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  ShieldCheck,
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
import { getCollapsed, getServerCollapsed, subscribe, toggleCollapsed } from "./rail-store"
import {
  getPreference,
  getServerPreference,
  setPreference,
  subscribe as subscribeTheme,
} from "./theme-store"
import { GlobalSearch } from "./global-search"
import { ReminderBell } from "./reminder-bell"

/**
 * The application shell: a persistent rail, and a working area beside it.
 *
 * The rail lists only modules that exist. The reference design also shows
 * Expenses, Renewals, Domains, Tickets, Reports and Team Management; those
 * have no data model yet, and a nav entry leading to an empty screen is worse
 * than no entry. Each one is added here as its stage lands.
 */

export type NavItem = NavMatch & {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}

type NavGroup = { label: string | null; items: NavItem[] }

const WORKSPACE: NavItem[] = [
  { href: "/dashboard", match: "/dashboard", exact: true, label: "Overview", icon: LayoutGrid },
  { href: "/crm", match: "/crm", label: "Sales & Leads", icon: Briefcase },
  { href: "/dashboard/clients", match: "/dashboard/clients", label: "Clients", icon: UsersRound },
  { href: "/projects", match: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/tasks", match: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/calendar", match: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/documents", match: "/dashboard/documents", label: "Documents", icon: FileText },
]

const ADMINISTRATION: NavItem = {
  href: "/dashboard/settings/business",
  match: "/dashboard/settings",
  label: "Settings",
  icon: Settings,
}

/** Operator-only. Hiding it is cosmetic - requireSuperAdmin() is the gate. */
const ACCOUNTS: NavItem = {
  href: "/dashboard/admin",
  match: "/dashboard/admin",
  label: "Accounts",
  icon: ShieldCheck,
}

export function buildNav(isSuperAdmin: boolean): NavGroup[] {
  return [
    { label: null, items: WORKSPACE },
    { label: "Administration", items: isSuperAdmin ? [ACCOUNTS, ADMINISTRATION] : [ADMINISTRATION] },
  ]
}

/** Two letters for the avatar, from a display name or failing that the address. */
export function initials(name: string): string {
  const base = (name.includes("@") ? name.split("@")[0] : name).trim()
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase() || "?"
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
 * Cycles rather than opening a menu: three states, and the icon always says
 * which one you are in, so a menu would be ceremony around a one-click choice.
 * The full radio group in Settings is still there for picking directly.
 */
function ThemeCycle() {
  const preference = useSyncExternalStore(subscribeTheme, getPreference, getServerPreference)
  const Icon = THEME_ICON[preference]
  const next =
    THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length]
  const label = `Theme: ${THEME_LABEL[preference]}. Switch to ${THEME_LABEL[next]}.`

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      title={label}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4.5" />
    </button>
  )
}

function RailLink({
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
        "group relative flex h-10 items-center gap-3 rounded-lg text-sm transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      {/* The marker the reference puts against the active item. Rendered
          always and made transparent, so the row does not shift by 3px when
          selection moves. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 -left-3 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-colors",
          active ? "bg-sidebar-primary" : "bg-transparent"
        )}
      />
      <Icon className="size-4.5 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

export function AppShell({
  email,
  displayName,
  brandName,
  isSuperAdmin,
  children,
}: {
  email: string
  /** The person's name when we have one; the address is the fallback. */
  displayName?: string | null
  /** The operator's own company, from their business profile. */
  brandName: string
  isSuperAdmin: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const groups = useMemo(() => buildNav(isSuperAdmin), [isSuperAdmin])

  const collapsed = useSyncExternalStore(subscribe, getCollapsed, getServerCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  const name = displayName?.trim() || email
  const closeMobile = () => setMobileOpen(false)

  const rail = (
    <>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5",
          collapsed ? "justify-center px-0" : "px-5"
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground">
          {/* The product mark, same glyph as the favicon. */}
          <svg viewBox="0 0 24 24" className="size-5 text-background" aria-hidden>
            <path
              fill="currentColor"
              d="M5 3h9a6 6 0 0 1 0 12H9.8l-4.8 6V14.4A6 6 0 0 1 9.4 9H14a1.5 1.5 0 0 0 0-3H5z"
            />
          </svg>
        </span>
        {!collapsed && (
          <span className="truncate text-[15px] font-semibold tracking-tight">{brandName}</span>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2" aria-label="Main">
        {groups.map((group, i) => (
          <div key={group.label ?? `group-${i}`} className="space-y-0.5">
            {group.label && !collapsed && (
              <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </div>
            )}
            {group.label && collapsed && <div className="mx-2 mb-1.5 h-px bg-sidebar-border" />}
            {group.items.map((item) => (
              <RailLink
                key={item.href}
                item={item}
                active={isNavItemActive(pathname, item)}
                collapsed={collapsed}
                onNavigate={closeMobile}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className={cn(
            "hidden h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors outline-none md:flex",
            "hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed && "justify-center px-0"
          )}
        >
          <ChevronsLeft
            className={cn("size-4.5 shrink-0 transition-transform", collapsed && "rotate-180")}
            strokeWidth={1.75}
          />
          {!collapsed && "Collapse"}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        {rail}
      </aside>

      {/* Mobile: an overlay, so the rail never takes width from the content. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeMobile}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
            <button
              type="button"
              onClick={closeMobile}
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
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <Menu className="size-4.5" strokeWidth={1.75} />
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <GlobalSearch nav={groups.flatMap((g) => g.items)} />
            <ReminderBell />
            <ThemeCycle />

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Account"
                    className="ml-1 flex items-center gap-2.5 rounded-lg p-1 pr-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  />
                }
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {initials(name)}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-sm font-medium">
                    {name.includes("@") ? name.split("@")[0] : name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {isSuperAdmin ? "Admin" : "Member"}
                  </span>
                </span>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60">
                <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{email}</div>
                <DropdownMenuItem render={<Link href="/dashboard/settings/business" />}>
                  <Settings className="mr-2 size-4" /> Settings
                </DropdownMenuItem>
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
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
