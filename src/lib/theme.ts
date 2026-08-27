/**
 * Theme preference: shared by the pre-paint script, the client store and the
 * settings UI, so all three agree on the storage key and the resolution rule.
 *
 * Pure and dependency-free on purpose - the inline script below is stringified
 * into the document head and runs before React exists.
 */

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_STORAGE_KEY = "clientkit-theme"
export const THEME_PREFERENCES: ThemePreference[] = ["light", "dark", "system"]

/** Narrows anything read from storage or a form. Unknown input means "system". */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system"
}

/** What should actually be painted, given the preference and the OS setting. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light"
  return preference
}

/**
 * Runs synchronously in <head>, before first paint.
 *
 * This is what prevents a flash of the wrong theme: the class has to be on
 * <html> before the browser paints, which rules out doing it in an effect.
 * Everything is wrapped in try/catch because localStorage throws outright in
 * some privacy modes, and a broken theme must never break the page.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)};
var p=localStorage.getItem(k);
if(p!=="light"&&p!=="dark"&&p!=="system"){p="system"}
var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.classList.toggle("dark",d);
r.style.colorScheme=d?"dark":"light";
}catch(e){}})();`
