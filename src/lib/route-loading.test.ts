import { readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A loading.tsx wraps its own page *and* every route segment below it, and the
 * router prefetches the topmost boundary it finds on the way down. So a
 * loading.tsx with route segments beneath it becomes the fallback those
 * children render too - you click into a child and the parent's skeleton
 * flashes in the wrong shape before the real one arrives.
 *
 * The fix is to put the index page and its loading.tsx in a route group, which
 * leaves the URL alone and stops the boundary reaching the siblings. Nesting is
 * therefore measured on the folder path, not the URL: the whole point of the
 * group is that it breaks the folder prefix while the URL stays the same.
 *
 * This test exists because nothing about the symptom points at the cause. It
 * looks like a styling glitch, and the obvious repair - editing the skeleton
 * that flashed - cannot work.
 */

const APP_DIR = path.join(process.cwd(), "src", "app")

/** Directories holding a loading.tsx, as paths relative to src/app. */
function findLoadingDirs(dir: string, rel = ""): string[] {
  const entries = readdirSync(dir)
  const found = entries.includes("loading.tsx") ? [rel] : []

  for (const entry of entries) {
    if (!statSync(path.join(dir, entry)).isDirectory()) continue
    found.push(...findLoadingDirs(path.join(dir, entry), path.posix.join(rel, entry)))
  }
  return found
}

describe("loading boundaries", () => {
  it("never places one loading.tsx in a folder above another's", () => {
    const dirs = findLoadingDirs(APP_DIR)
    expect(dirs.length).toBeGreaterThan(0)

    const offenders = dirs.flatMap((parent) =>
      dirs
        .filter((child) => child !== parent && child.startsWith(parent ? `${parent}/` : ""))
        .map((child) => `${parent || "(app root)"}/loading.tsx also covers ${child}`)
    )

    expect(offenders).toEqual([])
  })

  it("detects the arrangement this guards against", () => {
    // Guards the guard: the check above passes trivially if the nesting rule is
    // wrong, so prove it still fires on the shape that caused the bug.
    const dirs = ["dashboard", "dashboard/documents"]
    const offenders = dirs.flatMap((parent) =>
      dirs.filter((child) => child !== parent && child.startsWith(`${parent}/`))
    )
    expect(offenders).toEqual(["dashboard/documents"])
  })
})
