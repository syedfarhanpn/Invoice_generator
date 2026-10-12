import { redirect } from "next/navigation"

/**
 * Domains & Hosting moved into Renewals.
 *
 * They were always one table read through two screens, which meant "what
 * renews this month" took two visits and some mental addition. The tabs on
 * /renewals do that job now.
 *
 * This route stays as a redirect rather than being deleted: bookmarks, the
 * overview's renewal panel and anything an operator pasted into a message
 * should land on the right screen rather than a 404. No permission check here
 * - /renewals does its own, and redirecting an unauthorised viewer to a page
 * that will turn them away is the same outcome by a shorter path.
 */
export default function DomainsPage() {
  redirect("/renewals")
}
