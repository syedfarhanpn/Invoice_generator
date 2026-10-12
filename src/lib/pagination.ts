/**
 * Page arithmetic for tables.
 *
 * Pure and dependency-free, in lib/ rather than beside the component, so it
 * can be tested without a DOM - the same split as src/lib/ordering.ts and
 * src/lib/nav.ts.
 */

export const PAGE_SIZES = [10, 25, 50, 100] as const

/**
 * The pages a control should show, with long runs collapsed: 1 … 4 5 6 … 12.
 *
 * The window is padded at the ends so it keeps a steady width as you walk
 * through the pages, rather than growing and shrinking under the pointer.
 */
export function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set<number>([1, total, current, current - 1, current + 1])
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p))
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p))

  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)

  const out: (number | "gap")[] = []
  let previous = 0
  for (const page of sorted) {
    // A gap hiding a single page would be longer than the page it hides.
    if (previous && page - previous === 2) out.push(previous + 1)
    else if (previous && page - previous > 2) out.push("gap")
    out.push(page)
    previous = page
  }
  return out
}

/** Clamps a page into range - a filter can shrink the list under you. */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages))
}

/** The slice of rows a page shows. */
export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = clampPage(page, totalPages)
  return rows.slice((current - 1) * pageSize, current * pageSize)
}
