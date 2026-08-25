export type NavMatch = {
  /** Path prefix this item lights up for. */
  match: string
  /**
   * Index routes must match exactly. Without this "/dashboard" is a prefix of
   * every other dashboard route, so the Dashboard tab would stay highlighted
   * on Documents, Clients and Settings too.
   */
  exact?: boolean
}

/** Whether a nav item should render as the current page. */
export function isNavItemActive(pathname: string, item: NavMatch): boolean {
  if (item.exact) return pathname === item.match
  // Compare on a segment boundary so "/dashboard/clients" does not also match
  // a sibling route like "/dashboard/clients-archive".
  return pathname === item.match || pathname.startsWith(`${item.match}/`)
}
