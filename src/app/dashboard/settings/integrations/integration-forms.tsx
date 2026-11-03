"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  ConnectionStatus,
  HelpLink,
  IntegrationOutcome,
  useIntegrationAction,
} from "@/components/app/integration-ui"
import type { ConnectionView } from "@/lib/integrations/view"
import { disconnectClaude, saveClaudeIntegration } from "./actions"

/**
 * Meta, as a company sees it: whether it is set up, never a form. The
 * platform admin connects it from the Accounts console.
 */
export function MetaStatus({ view }: { view: ConnectionView }) {
  if (!view.connected) {
    return (
      <p className="text-sm text-muted-foreground">
        Not set up yet. Contact your platform admin to connect your Meta dataset.
      </p>
    )
  }

  return (
    <div className="space-y-1">
      <ConnectionStatus view={view} noun="token" connectedNote="set up by your platform admin" />
      {view.datasetId && (
        <p className="text-sm text-muted-foreground">
          Dataset {view.datasetId}
          {view.testEventCode ? " · sending to Test Events in Events Manager" : ""}
        </p>
      )}
    </div>
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
              run(() => disconnectClaude())
            }}
          >
            Disconnect
          </Button>
        )}
      </div>
      <IntegrationOutcome result={result} />
    </form>
  )
}
