"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import {
  disconnectIntegration,
  saveClaudeIntegration,
  saveMetaIntegration,
  type IntegrationResult,
} from "./actions"

/** What the page may know about a connection. Never the secret. */
export type ConnectionView = {
  connected: boolean
  readable: boolean
  hint: string | null
  datasetId: string | null
  testEventCode: string | null
  updatedLabel: string | null
}

function ConnectionStatus({ view, noun }: { view: ConnectionView; noun: string }) {
  if (!view.connected) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden className="size-2 rounded-full bg-muted-foreground/40" />
        Not connected
      </p>
    )
  }

  // Saved under a different INTEGRATIONS_SECRET_KEY than this server has.
  if (!view.readable) {
    return (
      <p className="flex items-center gap-2 text-sm text-tone-warning">
        <span aria-hidden className="size-2 rounded-full bg-tone-warning" />
        Saved, but this server cannot read it. Paste the {noun} again, or check the server&apos;s encryption key.
      </p>
    )
  }

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      <span aria-hidden className="size-2 rounded-full bg-tone-success" />
      <span className="font-medium text-tone-success">Connected</span>
      <span className="text-muted-foreground">
        {view.hint ? `${noun} ending ${view.hint}` : null}
        {view.updatedLabel ? ` · updated ${view.updatedLabel}` : null}
      </span>
    </p>
  )
}

function useIntegrationAction() {
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

function Outcome({ result }: { result: IntegrationResult | null }) {
  if (!result) return null
  if (!result.ok) return <p className="text-sm text-destructive">{result.error}</p>
  return (
    <p className={cn("text-sm", result.warning ? "text-tone-warning" : "text-tone-success")}>
      {result.warning ?? "Saved and checked."}
    </p>
  )
}

function HelpLink({ href, children }: { href: string; children: React.ReactNode }) {
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

// ---------------------------------------------------------------------------

export function MetaForm({ view, editable }: { view: ConnectionView; editable: boolean }) {
  const [datasetId, setDatasetId] = useState(view.datasetId ?? "")
  const [accessToken, setAccessToken] = useState("")
  const [testEventCode, setTestEventCode] = useState(view.testEventCode ?? "")
  const { run, pending, result } = useIntegrationAction()

  if (!editable) {
    return (
      <div className="space-y-1">
        <ConnectionStatus view={view} noun="token" />
        {view.connected && view.datasetId && (
          <p className="text-sm text-muted-foreground">
            Dataset {view.datasetId}
            {view.testEventCode ? " · sending to Test Events" : ""}
          </p>
        )}
      </div>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveMetaIntegration({ datasetId, accessToken, testEventCode }), () => setAccessToken(""))
      }}
    >
      <ConnectionStatus view={view} noun="token" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="meta-dataset">Dataset ID</Label>
          <Input
            id="meta-dataset"
            inputMode="numeric"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            placeholder="1234567890123456"
            required
            disabled={pending}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meta-test-code">Test event code (optional)</Label>
          <Input
            id="meta-test-code"
            value={testEventCode}
            onChange={(e) => setTestEventCode(e.target.value)}
            placeholder="TEST12345"
            disabled={pending}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">Only while testing. Clear it to send live events.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meta-token">Access token</Label>
        <Input
          id="meta-token"
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder={view.connected ? "Leave blank to keep the current token" : "EAAB…"}
          required={!view.connected}
          disabled={pending}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          In <HelpLink href="https://business.facebook.com/events_manager2">Events Manager</HelpLink>, open your
          dataset, then Settings, then Conversions API, and generate an access token.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner label="Checking with Meta" className="mr-2" />}
          {pending ? "Checking..." : view.connected ? "Save changes" : "Connect Meta"}
        </Button>
        {view.connected && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!confirm("Stop sending lead events to Meta? The saved token is deleted.")) return
              run(() => disconnectIntegration("META_CAPI"))
            }}
          >
            Disconnect
          </Button>
        )}
      </div>
      <Outcome result={result} />
    </form>
  )
}

export function ClaudeForm({ view, editable }: { view: ConnectionView; editable: boolean }) {
  const [apiKey, setApiKey] = useState("")
  const { run, pending, result } = useIntegrationAction()

  if (!editable) return <ConnectionStatus view={view} noun="key" />

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveClaudeIntegration({ apiKey }), () => setApiKey(""))
      }}
    >
      <ConnectionStatus view={view} noun="key" />

      <div className="space-y-1.5">
        <Label htmlFor="claude-key">Anthropic API key</Label>
        <Input
          id="claude-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={view.connected ? "Paste a new key to replace the current one" : "sk-ant-…"}
          required
          disabled={pending}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Create one in the <HelpLink href="https://platform.claude.com/settings/keys">Claude Console</HelpLink>.
          Setting a monthly spend limit there keeps the cost predictable.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner label="Checking with Anthropic" className="mr-2" />}
          {pending ? "Checking..." : view.connected ? "Replace key" : "Connect Claude"}
        </Button>
        {view.connected && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (!confirm("Disconnect Claude? Proposals cannot be written until a key is added again.")) return
              run(() => disconnectIntegration("ANTHROPIC"))
            }}
          >
            Disconnect
          </Button>
        )}
      </div>
      <Outcome result={result} />
    </form>
  )
}
