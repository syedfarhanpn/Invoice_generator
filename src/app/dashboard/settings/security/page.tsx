import { redirect } from "next/navigation"

/** Folded into the main settings page; kept so existing links still land. */
export default function SecurityRedirect() {
  redirect("/dashboard/settings/business")
}
