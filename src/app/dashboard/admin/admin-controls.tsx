"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { changeUserRole, provisionUser, restoreUser, suspendUser } from "./actions"

function useAdminAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(fn: () => Promise<void>, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (err) {
        // The server actions throw the guard's own reason, which is written
        // to be shown to a human.
        setError(err instanceof Error ? err.message : "That action could not be completed.")
      }
    })
  }

  return { run, pending, error }
}

export function ProvisionForm() {
  const [email, setEmail] = useState("")
  const { run, pending, error } = useAdminAction()

  return (
    <div className="space-y-2">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(async () => {
            await provisionUser(email)
            setEmail("")
          })
        }}
      >
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@company.com"
          className="w-72"
          disabled={pending}
        />
        <Button type="submit" disabled={pending || !email.trim()}>
          {pending && <Spinner label="Granting access" className="mr-2" />}
          {pending ? "Granting..." : "Grant access"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        This grants access inside the app. The person still needs a Supabase account with the
        same address — create it in the Supabase dashboard, since this app deliberately has no
        code path that can mint one.
      </p>
    </div>
  )
}

export function UserRowActions({
  userId,
  email,
  role,
  status,
  isSelf,
}: {
  userId: string
  email: string
  role: "USER" | "SUPER_ADMIN"
  status: "ACTIVE" | "SUSPENDED"
  isSelf: boolean
}) {
  const { run, pending, error } = useAdminAction()

  if (isSelf) {
    return <span className="text-xs text-muted-foreground">This is you</span>
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {role === "USER" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => changeUserRole(userId, "SUPER_ADMIN"),
                `Make ${email} a super admin? They will be able to manage every account, including yours.`
              )
            }
          >
            Make admin
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => changeUserRole(userId, "USER"), `Demote ${email} to a normal user?`)}
          >
            Demote
          </Button>
        )}

        {status === "ACTIVE" ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              run(
                () => suspendUser(userId),
                `Suspend ${email}? They will be signed out and refused at the next request. Their data is kept.`
              )
            }
          >
            Suspend
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => restoreUser(userId))}>
            Restore
          </Button>
        )}
      </div>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
