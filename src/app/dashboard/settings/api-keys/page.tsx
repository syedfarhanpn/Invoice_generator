import { redirect } from "next/navigation"

/** Folded into the main settings page; kept so existing links still land. */
export default function ApiKeysRedirect() {
  redirect("/dashboard/settings/business")
}
