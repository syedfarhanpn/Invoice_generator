/**
 * Suggested expense categories.
 *
 * In a plain module, not beside the server actions: a "use server" file may
 * only export async functions, so a const there breaks the build the moment a
 * Client Component imports it. The list is a suggestion anyway - the column is
 * free text, because what an agency tracks changes faster than a deploy.
 */
export const DEFAULT_CATEGORIES = [
  "Software & Tools",
  "Hosting & Domains",
  "Marketing & Ads",
  "Team & Salaries",
  "Office & Utilities",
  "Travel & Meetings",
  "Equipment",
  "Professional Services",
  "Taxes & Fees",
]
