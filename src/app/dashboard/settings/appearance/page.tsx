import { Card } from "@/components/ui/card"
import { ThemeToggle } from "@/components/app/theme-toggle"

export const metadata = { title: "Appearance" }

export default function AppearancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Appearance</h2>
        <p className="text-muted-foreground">Choose how this workspace looks on this device.</p>
      </div>

      <Card>
        <div className="space-y-4 px-(--card-spacing)">
          <div>
            <h3 className="font-heading text-base font-medium">Colour theme</h3>
            <p className="text-sm text-muted-foreground">
              Applies immediately and is remembered in this browser. Documents you share with
              clients always print on white, whatever you pick here.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </Card>
    </div>
  )
}
