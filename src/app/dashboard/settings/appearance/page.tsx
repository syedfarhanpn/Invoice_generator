import { requirePermission } from "@/lib/access"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeSelect } from "@/components/app/theme-select"

export const metadata = { title: "Appearance" }

/**
 * How this app looks, which is a different question from how your documents
 * look - that lives with the company profile, because it is part of what a
 * client receives rather than a preference of yours.
 */
export default async function AppearancePage() {
  await requirePermission("settings", "read")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Light or dark for this app, remembered in this browser. It does not affect your
          documents - those follow Document Appearance under Profile &amp; documents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeSelect />
      </CardContent>
    </Card>
  )
}
