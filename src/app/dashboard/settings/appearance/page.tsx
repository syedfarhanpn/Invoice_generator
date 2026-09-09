import { redirect } from "next/navigation"

/** Folded into the main settings page; kept so existing links still land. */
export default function AppearanceRedirect() {
  redirect("/dashboard/settings/business")
}
