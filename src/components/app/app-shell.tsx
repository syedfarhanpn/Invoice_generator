"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Briefcase,
  CalendarDays,
  CalendarSync,
  ChevronsLeft,
  FileText,
  FolderKanban,
  LayoutGrid,
  ListChecks,
  LogOut,
  LifeBuoy,
  Menu,
  ChartColumn,
  Receipt,
  Settings,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react"

import { logout } from "@/app/login/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { memberInitials } from "@/lib/member-names"
import { isNavItemActive, type NavMatch } from "@/lib/nav"
import type { Access, Module } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { getCollapsed, getServerCollapsed, subscribe, toggleCollapsed } from "./rail-store"
import { GlobalSearch } from "./global-search"
import { ReminderBell } from "./reminder-bell"

/**
 * The application shell: a persistent rail, and a working area beside it.
 *
 * The rail lists only modules that exist. The reference design also shows
 * Team Management, which has no screen yet; a nav entry leading to an empty
 * screen is worse than no entry, so it lands with its stage.
 *
 * The entries are grouped once there are enough of them to scan rather than
 * read: what you sell, what you run, and what the business costs.
 */

export type NavItem = NavMatch & {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  /**
   * Which permission governs this entry. Omitted for the overview, which
   * everyone in a workspace can reach.
   *
   * Filtering the rail by this is a COURTESY, not a control - the page
   * itself calls requirePermission(). Naming the module here is what keeps
   * the two in step: a new module gets a nav entry and a gate from the same
   * list of names.
   */
  module?: Module
  /**
   * For one entry that covers more than one module: Renewals holds AMCs
   * (renewals) and infrastructure (domains) in one screen, and someone who
   * may read either should see the way in. The page gates each half
   * separately, and the tabs only offer what the viewer can actually read.
   */
  anyModule?: Module[]
}

/**
 * The rail, as one flat list.
 *
 * The headings are gone on purpose: with a dozen entries, grouping them under
 * Services / Finance / Administration cost four lines of chrome to save
 * nobody any scanning, and it made the rail taller than the list it was
 * organising. Order carries the grouping now - what you work on, then what
 * recurs, then the money, then the team.
 *
 * Documents sits beside Projects rather than after Calendar, because an
 * invoice follows a project: that is the order the work happens in.
 *
 * Settings and Accounts are NOT here. They belong to the account rather than
 * to the work, so they live in the avatar menu with Sign out.
 */
const NAV: NavItem[] = [
  { href: "/dashboard", match: "/dashboard", exact: true, label: "Overview", icon: LayoutGrid },
  { href: "/crm", match: "/crm", label: "Sales & Leads", icon: Briefcase, module: "sales" },
  { href: "/dashboard/clients", match: "/dashboard/clients", label: "Clients", icon: UsersRound, module: "clients" },
  { href: "/projects", match: "/projects", label: "Projects", icon: FolderKanban, module: "projects" },
  { href: "/dashboard/documents", match: "/dashboard/documents", label: "Documents", icon: FileText, module: "documents" },
  { href: "/tasks", match: "/tasks", label: "Tasks", icon: ListChecks, module: "tasks" },
  { href: "/calendar", match: "/calendar", label: "Calendar", icon: CalendarDays, module: "calendar" },
  // One entry, because they are one table: AMCs, domains and hosting all
  // renew on a date and all want the same five decisions. /domains redirects
  // here so older links still land somewhere.
  {
    href: "/renewals",
    match: "/renewals",
    label: "Renewals",
    icon: CalendarSync,
    anyModule: ["renewals", "domains"],
  },
  { href: "/tickets", match: "/tickets", label: "Support Tickets", icon: LifeBuoy, module: "tickets" },
  { href: "/expenses", match: "/expenses", label: "Expenses", icon: Receipt, module: "expenses" },
  { href: "/reports", match: "/reports", label: "Reports", icon: ChartColumn, module: "reports" },
  { href: "/team", match: "/team", label: "Team Management", icon: UsersRound, module: "team" },
]

/** In the avatar menu rather than the rail: about the account, not the work. */
const SETTINGS: NavItem = {
  href: "/dashboard/settings/business",
  match: "/dashboard/settings",
  label: "Settings",
  icon: Settings,
  module: "settings",
}

/** Operator-only. Hiding it is cosmetic - requireSuperAdmin() is the gate. */
const ACCOUNTS: NavItem = {
  href: "/dashboard/admin",
  match: "/dashboard/admin",
  label: "Accounts",
  icon: ShieldCheck,
}

/**
 * An entry with no module is always shown; one with a module needs at least
 * read, and one with anyModule needs read on at least one of them.
 */
function allowed(items: NavItem[], matrix: Record<Module, Access> | null): NavItem[] {
  const readable = (m: Module) => matrix != null && matrix[m] !== "none"
  return items.filter((item) => {
    if (item.anyModule) return item.anyModule.some(readable)
    return !item.module || readable(item.module)
  })
}

export function buildNav(
  /** What the viewer may read. Null means no workspace, so nothing shows. */
  matrix: Record<Module, Access> | null
): NavItem[] {
  return allowed(NAV, matrix)
}

/** Settings and Accounts, for the avatar menu. */
export function buildAccountNav(
  isSuperAdmin: boolean,
  matrix: Record<Module, Access> | null
): NavItem[] {
  return allowed(isSuperAdmin ? [ACCOUNTS, SETTINGS] : [SETTINGS], matrix)
}

/** Re-exported so the shell keeps one import, but there is one implementation. */
export { memberInitials as initials } from "@/lib/member-names"

// ---------------------------------------------------------------------------

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

/**
 * The mark at the top of the rail.
 *
 * The logo uploaded in Settings - Business when there is one, and the
 * built-in glyph when there is not. A plain <img>, not next/image: the file
 * lives in Supabase storage under whatever project this deployment points
 * at, and next/image would need that host whitelisted in next.config before
 * it would render at all. The invoice header loads it the same way.
 *
 * onError falls the element back to the glyph rather than leaving the broken
 * image icon in the corner of every page - a logo deleted straight out of the
 * bucket should not look like the app is broken.
 */
function BrandMark({ logoUrl, brandName }: { logoUrl: string | null; brandName: string }) {
  const [failed, setFailed] = useState(false)

  if (logoUrl && !failed) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={brandName}
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }

  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground">
      {/* The product mark, same glyph as the favicon. */}
      <svg viewBox="0 0 24 24" className="size-5 text-background" aria-hidden>
        <path
          fill="currentColor"
          d="M5 3h9a6 6 0 0 1 0 12H9.8l-4.8 6V14.4A6 6 0 0 1 9.4 9H14a1.5 1.5 0 0 0 0-3H5z"
        />
      </svg>
    </span>
  )
}

export function AppShell({
  email,
  displayName,
  brandName,
  logoUrl,
  isSuperAdmin,
  matrix,
  children,
}: {
  email: string
  /** The person's name when we have one; the address is the fallback. */
  displayName?: string | null
  /** The operator's own company, from their business profile. */
  brandName: string
  /** Their uploaded logo, from the same profile. Null uses the glyph. */
  logoUrl?: string | null
  isSuperAdmin: boolean
  /**
   * What the viewer may read, resolved on the server by src/lib/access.ts.
   * Used to decide which entries the rail shows - a courtesy, not a control.
   * Every page behind these links calls requirePermission() for itself.
   */
  matrix: Record<Module, Access> | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const navItems = useMemo(() => buildNav(matrix), [matrix])
  const accountItems = useMemo(
    () => buildAccountNav(isSuperAdmin, matrix),
    [isSuperAdmin, matrix]
  )

  const collapsed = useSyncExternalStore(subscribe, getCollapsed, getServerCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  const name = displayName?.trim() || email
  // The address makes a poor name, so when it is all we have the mailbox
  // part reads better than the whole thing - and the full address is shown
  // under it in the menu either way.
  const displayLabel = name.includes("@") ? name.split("@")[0] : name
  const closeMobile = () => setMobileOpen(false)

  const rail = (
    <>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2.5",
          collapsed ? "justify-center px-0" : "px-5"
        )}
      >
        <BrandMark logoUrl={logoUrl ?? null} brandName={brandName} />
        {!collapsed && (
          <span className="truncate text-[15px] font-semibold tracking-tight">{brandName}</span>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {navItems.map((item) => (
          <RailLink
            key={item.href}
            item={item}
            active={isNavItemActive(pathname, item)}
            collapsed={collapsed}
            onNavigate={closeMobile}
          />
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
            {/* Search covers the account pages too, so they stay reachable by
                name now that they have left the rail. */}
            <GlobalSearch nav={[...navItems, ...accountItems]} />
            <ReminderBell />

            {/* Avatar alone. Who you are is a thing you check occasionally,
                not a thing the header needs to assert on every page - and the
                name and role were the only items here that grew with their
                content, so the row's width moved with whoever signed in.
                Everything that was beside it now lives inside the menu. */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Account: ${displayLabel}`}
                    className="ml-1 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  />
                }
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {memberInitials(name)}
                </span>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64">
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                    {memberInitials(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{displayLabel}</span>
                    {/* The address, because an initialled circle is not enough
                        to tell two accounts apart when you are signed into
                        the wrong one. */}
                    <span className="block truncate text-xs text-muted-foreground">{email}</span>
                  </span>
                </div>

                <div className="px-2 pb-2">
                  <span className="inline-flex rounded-md bg-tone-info-bg px-2 py-0.5 text-xs font-medium text-tone-info">
                    {isSuperAdmin ? "Admin" : "Member"}
                  </span>
                </div>

                <DropdownMenuSeparator />

                {/* Settings and Accounts live here rather than in the rail:
                    they are about the account, not about the work. Each still
                    carries its own module gate, so the menu shows only what
                    the viewer may actually open. */}
                {accountItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
                      <Icon className="mr-2 size-4" /> {item.label}
                    </DropdownMenuItem>
                  )
                })}

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
