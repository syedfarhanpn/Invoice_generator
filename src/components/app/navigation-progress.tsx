"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * Thin progress bar across the top of the window during navigation.
 *
 * Next's own `useLinkStatus` only reports the pending state of the one <Link>
 * it is rendered inside, so covering every link in the app would mean touching
 * every link. This listens for same-origin anchor clicks instead, which also
 * catches table rows, buttons wrapped in links, and back/forward.
 *
 * Completion is keyed off pathname + searchParams, so it also resolves for
 * navigations that only change the query string (the document filter chips).
 */

/** The bar stays transparent for its first ~120ms (see the nav-progress
 *  keyframes in globals.css), so a fast navigation never flashes one. */

/** Failsafe: a navigation that never lands must not strand the bar. */
const MAX_VISIBLE_MS = 10_000

function NavigationProgressBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`

  // The route we were on when a navigation began. While it still matches the
  // current route we are mid-flight; the moment they differ, we have arrived.
  // Deriving it this way avoids setting state from an effect on every
  // navigation just to flip a flag.
  const [startedFrom, setStartedFrom] = useState<string | null>(null)
  const failsafe = useRef<ReturnType<typeof setTimeout> | null>(null)

  const navigating = startedFrom !== null && startedFrom === routeKey

  // --- start on a same-origin navigation -----------------------------------
  useEffect(() => {
    const begin = () => {
      setStartedFrom(`${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`)
      if (failsafe.current) clearTimeout(failsafe.current)
      // A navigation that never lands must not strand the bar.
      failsafe.current = setTimeout(() => setStartedFrom(null), MAX_VISIBLE_MS)
    }

    const onClick = (e: MouseEvent) => {
      // Ignore anything the browser will not treat as a plain navigation.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest?.("a")
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) return
      if (anchor.target && anchor.target !== "_self") return
      if (anchor.hasAttribute("download")) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.href === window.location.href) return // no navigation will occur
      begin()
    }

    document.addEventListener("click", onClick, { capture: true })
    window.addEventListener("popstate", begin)
    return () => {
      document.removeEventListener("click", onClick, { capture: true })
      window.removeEventListener("popstate", begin)
      if (failsafe.current) clearTimeout(failsafe.current)
    }
  }, [])

  // --- retire the bar once the new route has painted -----------------------
  useEffect(() => {
    if (navigating || startedFrom === null) return
    // setState here runs from a timer, not synchronously during the effect.
    const timer = setTimeout(() => setStartedFrom(null), 300)
    return () => clearTimeout(timer)
  }, [navigating, startedFrom])

  if (startedFrom === null) return null

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-busy={navigating}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 print:hidden"
    >
      <div
        className={
          navigating
            ? "h-full animate-[nav-progress_2.5s_ease-out_forwards] bg-primary"
            : "h-full w-full bg-primary opacity-0 transition-opacity duration-300 ease-out"
        }
      />
    </div>
  )
}

/**
 * useSearchParams() suspends during prerender, so the bar is isolated behind
 * its own boundary rather than opting whole pages out of static rendering.
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  )
}
