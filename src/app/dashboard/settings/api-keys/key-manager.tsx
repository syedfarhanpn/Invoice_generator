"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { createApiKey, revokeApiKey } from "./actions"

export function KeyManager() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [issued, setIssued] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        const { plaintext } = await createApiKey(name)
        setIssued(plaintext)
        setName("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create the key.")
      }
    })
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-center gap-2" onSubmit={handleCreate}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. CRM production"
          className="w-72"
          disabled={pending}
          required
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending && <Spinner label="Creating key" className="mr-2" />}
          {pending ? "Creating..." : "Create key"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {issued && (
        <Card className="border-primary">
          <div className="space-y-2 px-(--card-spacing)">
            <p className="text-sm font-medium">Copy this key now — it is shown only once.</p>
            <code className="block overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {issued}
            </code>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(issued).catch(() => {})}
              >
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
                Done
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only a hash is stored, so this cannot be shown again. If you lose it, revoke the key
              and create another.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

export function RevokeButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Revoke "${name}"? Any integration using it will stop working immediately.`)) return
        startTransition(async () => {
          await revokeApiKey(id).catch(() => {})
          router.refresh()
        })
      }}
    >
      Revoke
    </Button>
  )
}
