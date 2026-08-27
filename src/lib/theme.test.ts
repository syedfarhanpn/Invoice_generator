import { describe, expect, it } from "vitest"

import {
  parseThemePreference,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
} from "./theme"

describe("parseThemePreference", () => {
  it("accepts every supported preference", () => {
    for (const p of THEME_PREFERENCES) expect(parseThemePreference(p)).toBe(p)
  })

  it("falls back to system for anything unrecognised", () => {
    // The value comes out of localStorage, which any script on the origin can
    // write, so it is untrusted.
    for (const bad of [null, undefined, "", "DARK", "blue", 1, {}, [], "__proto__"]) {
      expect(parseThemePreference(bad)).toBe("system")
    }
  })
})

describe("resolveTheme", () => {
  it("honours an explicit choice over the OS setting", () => {
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })

  it("follows the OS when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
  })

  it("only ever returns light or dark", () => {
    for (const p of THEME_PREFERENCES) {
      for (const sys of [true, false]) {
        expect(["light", "dark"]).toContain(resolveTheme(p, sys))
      }
    }
  })
})

describe("THEME_INIT_SCRIPT", () => {
  it("uses the same storage key as the client store", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY))
  })

  it("is wrapped in try/catch", () => {
    // localStorage throws outright in some privacy modes; a broken theme must
    // never take the page down with it.
    expect(THEME_INIT_SCRIPT).toContain("try{")
    expect(THEME_INIT_SCRIPT).toContain("catch(e)")
  })

  it("is self-contained and synchronous", () => {
    // It runs in <head> before React exists, so it may not reference any
    // module scope, and must not defer its work.
    expect(THEME_INIT_SCRIPT).not.toMatch(/\bimport\b|\brequire\(|addEventListener|setTimeout/)
    expect(THEME_INIT_SCRIPT.startsWith("(function(){")).toBe(true)
  })

  it("sets both the class and color-scheme", () => {
    expect(THEME_INIT_SCRIPT).toContain('classList.toggle("dark"')
    expect(THEME_INIT_SCRIPT).toContain("colorScheme")
  })

  it("contains no closing script tag that could break out of the tag", () => {
    // It is injected via dangerouslySetInnerHTML into a <script> element.
    expect(THEME_INIT_SCRIPT.toLowerCase()).not.toContain("</script")
  })

  it("actually resolves correctly when executed", () => {
    // Run the real script against a stubbed DOM to prove the inlined logic
    // matches resolveTheme, rather than trusting they stayed in sync.
    const run = (stored: string | null, systemDark: boolean) => {
      const root = { classList: { value: false, toggle(_c: string, on: boolean) { this.value = on } }, style: { colorScheme: "" } }
      const fn = new Function(
        "localStorage",
        "window",
        "document",
        THEME_INIT_SCRIPT
      )
      fn(
        { getItem: () => stored },
        { matchMedia: () => ({ matches: systemDark }) },
        { documentElement: root }
      )
      return { dark: root.classList.value, colorScheme: root.style.colorScheme }
    }

    expect(run("dark", false)).toEqual({ dark: true, colorScheme: "dark" })
    expect(run("light", true)).toEqual({ dark: false, colorScheme: "light" })
    expect(run("system", true)).toEqual({ dark: true, colorScheme: "dark" })
    expect(run("system", false)).toEqual({ dark: false, colorScheme: "light" })
    // Unset and junk both fall through to the system setting.
    expect(run(null, true)).toEqual({ dark: true, colorScheme: "dark" })
    expect(run("nonsense", false)).toEqual({ dark: false, colorScheme: "light" })
  })
})
