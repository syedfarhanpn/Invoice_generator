"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink } from "lucide-react"

import type { ConnectionView, IntegrationResult } from "@/lib/integrations/view"
import { cn } from "@/lib/utils"

/**
 * The pieces an integration form is made of, shared by the company's
 * Settings page and the platform admin's company popup so a connection reads
 * the same wherever it is shown.
 */

export function ConnectionStatus({
  view,
  noun,
  connectedNote,
}: {
  view: ConnectionView
  /** What the secret is called here: "token", "key". */
  noun: string
  /** Shown after "Connected" in place of the key's last four characters. */
  connectedNote?: string
}) {
  if (!view.connected) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
        Not connected
      </p>
    )
  }

  // Saved under a different INTEGRATIONS_SECRET_KEY than this server has.
  if (!view.readable) {
    return (
      <p className="flex items-center gap-2 text-sm text-tone-warning">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-tone-warning" />
        Saved, but this server cannot read it. Paste the {noun} again, or check the server&apos;s encryption key.
      </p>
    )
  }

  const detail = connectedNote ?? (view.hint ? `${noun} ending ${view.hint}` : null)
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-tone-success" />
      <span className="font-medium text-tone-success">Connected</span>
      <span className="text-muted-foreground">
        {detail}
        {view.updatedLabel ? `${detail ? " · " : ""}updated ${view.updatedLabel}` : null}
      </span>
    </p>
  )
}

/** Runs a save or a disconnect, keeping what it reported. */
export function useIntegrationAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<IntegrationResult | null>(null)

  function run(action: () => Promise<IntegrationResult>, onSaved?: () => void) {
    setResult(null)
    startTransition(async () => {
      try {
        const outcome = await action()
        setResult(outcome)
        if (outcome.ok) {
          onSaved?.()
          router.refresh()
        }
      } catch {
        setResult({ ok: false, error: "That could not be saved. Try again." })
      }
    })
  }

  return { run, pending, result }
}

export function IntegrationOutcome({ result }: { result: IntegrationResult | null }) {
  if (!result) return null
  if (!result.ok) return <p className="text-sm text-destructive">{result.error}</p>
  return (
    <p className={cn("text-sm", result.warning ? "text-tone-warning" : "text-tone-success")}>
      {result.warning ?? "Saved and checked."}
    </p>
  )
}

export function HelpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}
