import { Building2 } from "lucide-react"

import { logout } from "@/app/login/actions"
import { Button } from "@/components/ui/button"

export const metadata = { title: "No workspace" }

/**
 * Where someone lands who is authenticated but belongs to no workspace.
 *
 * This is a real state, not an error: they signed in successfully, and there
 * is simply nothing for them yet. Signing out is the only action offered,
 * because it is the only one that would help.
 */
export default function NoWorkspacePage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center">
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Building2 className="size-5" strokeWidth={1.75} />
        </span>

        <h1 className="text-lg font-semibold tracking-tight">You are not in a workspace yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your sign-in worked, but this account has not been added to a team. Ask an administrator
          to invite you, then sign in again.
        </p>

        <form action={logout} className="mt-6">
          <Button type="submit" size="sm" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  )
}
