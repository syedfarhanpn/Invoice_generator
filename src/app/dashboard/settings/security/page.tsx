import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getCurrentUser } from "@/lib/current-user"
import { MIN_PASSWORD_LENGTH } from "@/lib/password"
import { SubmitButton } from "@/app/login/submit-button"
import { changePassword } from "./actions"

export default async function SecuritySettingsPage(props: {
  searchParams: Promise<{ error?: string; updated?: string }>
}) {
  const [searchParams, user] = await Promise.all([props.searchParams, getCurrentUser()])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Security</h2>
        <p className="text-muted-foreground">Manage the password for {user.email}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            You&apos;ll need your current password. Everywhere you&apos;re signed in stays
            signed in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={changePassword} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              <p className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>

            {searchParams?.error && (
              <p className="text-sm text-destructive">{searchParams.error}</p>
            )}
            {searchParams?.updated === "1" && (
              <p className="text-sm text-muted-foreground">Password updated.</p>
            )}

            <SubmitButton idleLabel="Update password" pendingLabel="Updating..." />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
