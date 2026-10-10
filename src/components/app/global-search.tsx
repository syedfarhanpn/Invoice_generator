"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

import type { NavItem } from "./app-shell"
import { cn } from "@/lib/utils"

/**
 * Jump to a module.
 *
 * It searches the navigation, which is what the shell actually knows about.
 * The reference puts "Search projects, clients, invoices..." here; that needs
 * a server-side search across several tables and lands with the modules it
 * would search. Until then the placeholder says what it really does, because
 * a box that silently fails to find your invoices is worse than one that
 * never claimed to.
 */
export function GlobalSearch({ nav }: { nav: NavItem[] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl/Cmd+K, as the reference advertises on the control itself.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  // Derived during render rather than stored: keeping a `matches` state in
  // sync with `query` would need an effect, and that effect is the cascading
  // render the lint rule is about.
  const trimmed = query.trim().toLowerCase()
  const matches = trimmed
    ? nav.filter((item) => item.label.toLowerCase().includes(trimmed)).slice(0, 7)
    : []
  // Clamped rather than reset in an effect, so a shrinking list cannot leave
  // the highlight pointing past the end.
  const highlighted = Math.min(active, Math.max(0, matches.length - 1))

  const go = (href: string) => {
    setQuery("")
    setOpen(false)
    inputRef.current?.blur()
    router.push(href)
  }

  return (
    <div ref={boxRef} className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
      />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive(Math.min(highlighted + 1, matches.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive(Math.max(highlighted - 1, 0))
          } else if (e.key === "Enter" && matches[highlighted]) {
            e.preventDefault()
            go(matches[highlighted].href)
          } else if (e.key === "Escape") {
            setOpen(false)
          }
        }}
        placeholder="Search pages..."
        aria-label="Search pages"
        className="h-9 w-40 rounded-lg border bg-card pr-14 pl-9 text-sm transition-[width,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:w-56 focus-visible:ring-2 focus-visible:ring-ring lg:w-56 lg:focus-visible:w-72"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground sm:block">
        Ctrl K
      </kbd>

      {open && trimmed !== "" && (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-72 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg">
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
                  i === highlighted
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
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
