import Link from "next/link"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset } from "../actions"
import { SubmitButton } from "../submit-button"

export const metadata = { title: "Reset password" }

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const searchParams = await props.searchParams
  const sent = searchParams.sent === "1"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
          <CardDescription>
            We&apos;ll email you a link to choose a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            // Deliberately says "if" - see requestPasswordReset() for why this
            // must not confirm whether the address exists.
            <div className="space-y-3 text-sm">
              <p>
                If that address has an account, a reset link is on its way. It expires
                shortly, so use it soon.
              </p>
              <p className="text-muted-foreground">
                Nothing arrived? Check spam, then try again.
              </p>
            </div>
          ) : (
            <form action={requestPasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
              {searchParams?.error && (
                <p className="text-sm text-destructive">{searchParams.error}</p>
              )}
              <div className="pt-2">
                <SubmitButton idleLabel="Send reset link" pendingLabel="Sending..." />
              </div>
            </form>
          )}
        </CardContent>
        <CardFooter>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
