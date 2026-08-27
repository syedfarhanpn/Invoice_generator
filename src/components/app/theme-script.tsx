import { THEME_INIT_SCRIPT } from "@/lib/theme"

/**
 * Injected into <head> so it executes before first paint.
 *
 * It must be a raw inline <script>, not next/script: anything deferred runs
 * after the browser has already painted, which is exactly the flash we are
 * avoiding. The content is a build-time constant with no interpolated input,
 * so dangerouslySetInnerHTML carries no injection risk here.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
}
