import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MIN_PASSWORD_LENGTH } from "@/lib/password"
import { createClient } from "@/utils/supabase/server"
import { setNewPassword } from "../actions"
import { SubmitButton } from "@/app/login/submit-button"

export const metadata = { title: "Set password" }

export default async function SetPasswordPage(props: {
  searchParams: Promise<{ error?: string; welcome?: string }>
}) {
  const searchParams = await props.searchParams

  // Only reachable with the session minted by /auth/confirm. Anyone arriving
  // without one gets sent to request a fresh link rather than a broken form.
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    redirect("/login/forgot?error=" + encodeURIComponent("That link has expired. Request a new one."))
  }

  const isWelcome = searchParams.welcome === "1"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            {isWelcome ? "Choose your password" : "Set a new password"}
          </CardTitle>
          <CardDescription>
            {isWelcome
              ? `Welcome. Pick a password for ${data.user.email} and you're in.`
              : `Signed in as ${data.user.email}. Choose a new password to finish.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setNewPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                At least {MIN_PASSWORD_LENGTH} characters. Length matters more than symbols.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
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
            <div className="pt-2">
              <SubmitButton idleLabel="Save password" pendingLabel="Saving..." />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
