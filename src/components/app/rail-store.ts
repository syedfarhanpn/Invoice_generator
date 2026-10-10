"use client"

/**
 * Whether the navigation rail is collapsed.
 *
 * An external store rather than useState + an effect, for the same reason the
 * theme is one: the value lives in localStorage, which cannot be read during a
 * server render. Seeding state in an effect means rendering the wrong width
 * first and correcting it, which is both a flash and a cascading render -
 * exactly what react-hooks/set-state-in-effect flags.
 *
 * useSyncExternalStore lets the server snapshot be declared explicitly
 * (expanded) while the client reads the real value on its first pass.
 */

const STORAGE_KEY = "clientkit-rail-collapsed"

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function getCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    // Private modes can throw on read, not only on write.
    return false
  }
}

/** The server has no storage, so it renders the rail expanded. */
export function getServerCollapsed(): boolean {
  return false
}

export function setCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0")
  } catch {
    // Non-fatal: it applies for this page view, it just will not be remembered.
  }
  emit()
}

export function toggleCollapsed() {
  setCollapsed(!getCollapsed())
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)

  // Another tab collapsed it; keep the two windows agreeing.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) emit()
  }
  window.addEventListener("storage", onStorage)

  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onStorage)
  }
}
