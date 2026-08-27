"use client"

import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme"

/**
 * A tiny external store for the theme, read through useSyncExternalStore.
 *
 * Why not useState: the pre-paint script has already written the class to
 * <html> by the time React hydrates, so component state initialised on the
 * server ("system") would disagree with the DOM. useSyncExternalStore lets us
 * declare the server snapshot explicitly and read the real value on the
 * client, with no hydration mismatch and no second render.
 */

const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function media(): MediaQueryList | null {
  return typeof window === "undefined" ? null : window.matchMedia("(prefers-color-scheme: dark)")
}

/** Applies the preference to the document. Safe to call repeatedly. */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference, media()?.matches ?? false)
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
  return resolved
}

export function getPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    // Private modes can throw on access, not just on write.
    return "system"
  }
}

/** Server render has no storage and no OS signal, so it assumes "system". */
export function getServerPreference(): ThemePreference {
  return "system"
}

export function setPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Non-fatal: the theme still applies for this page view, it just will not
    // be remembered.
  }
  applyTheme(preference)
  emit()
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)

  // Another tab changed the preference.
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(getPreference())
      emit()
    }
  }
  window.addEventListener("storage", onStorage)

  // The OS flipped while we are following it.
  const mq = media()
  const onSystemChange = () => {
    if (getPreference() === "system") {
      applyTheme("system")
      emit()
    }
  }
  mq?.addEventListener("change", onSystemChange)

  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onStorage)
    mq?.removeEventListener("change", onSystemChange)
  }
}
