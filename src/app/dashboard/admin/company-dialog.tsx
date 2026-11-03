"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { disconnectCompanyMeta, saveCompanyMeta, viewCompany } from "./actions"
import { ViewCompanySubmit } from "./admin-controls"

/**
 * A company, opened from its name in the Accounts console: what it is, and
 * the one thing only the platform admin sets up for it - its Meta
 * Conversions API. Viewing the company read-only is a button in here rather
 * than the name itself, so opening this never enters anyone's workspace by
 * accident.
 */

export type CompanyPanel = {
  id: string
  name: string
  addedLabel: string
  owner: { name: string | null; email: string; invited: boolean } | null
  team: number
  clients: number | null
  documents: number | null
  lastActiveLabel: string
  meta: ConnectionView
  claude: ConnectionView
  /** Why Meta cannot be changed right now, or null when it can. */
  metaBlocked: string | null
  /** The platform admin is viewing this company at the moment. */
  isOpen: boolean
}

export function CompanyName({ company }: { company: CompanyPanel }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {company.name}
      </button>
      {open && <CompanyDialog company={company} onOpenChange={setOpen} />}
    </>
  )
}

function CompanyDialog({ company, onOpenChange }: { company: CompanyPanel; onOpenChange: (open: boolean) => void }) {
  const owner = company.owner

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{company.name}</DialogTitle>
          <DialogDescription>
            {owner
              ? `Owned by ${owner.name ? `${owner.name} (${owner.email})` : owner.email}${owner.invited ? ", invited and not signed in yet" : ""}. `
              : "This company has no owner. "}
            Added {company.addedLabel}.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-4">
          <Fact label="Team" value={company.team} />
          <Fact label="Clients" value={company.clients ?? "—"} />
          <Fact label="Documents" value={company.documents ?? "—"} />
          <Fact label="Last active" value={company.lastActiveLabel} />
        </dl>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Meta Conversions API</h3>
            <p className="text-sm text-muted-foreground">
              Reports this company&apos;s lead stages to their own Meta dataset. Only you can change it; the
              company sees whether it is connected.
            </p>
          </div>
          {company.metaBlocked ? (
            <div className="space-y-1">
              <ConnectionStatus view={company.meta} noun="token" />
              <p className="text-sm text-tone-warning">{company.metaBlocked}</p>
            </div>
          ) : (
            <MetaConnectionForm orgId={company.id} view={company.meta} />
          )}
        </section>

        <section className="space-y-1.5 border-t pt-4">
          <h3 className="text-sm font-medium">Claude</h3>
          <ConnectionStatus view={company.claude} noun="key" />
          <p className="text-xs text-muted-foreground">
            The company adds its own Anthropic key in Settings - Integrations, and pays for its own proposals.
          </p>
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {company.isOpen ? (
            <Badge variant="secondary" className="self-center">
              Viewing now
            </Badge>
          ) : (
            <form action={viewCompany.bind(null, company.id)}>
              <ViewCompanySubmit>View company (read-only)</ViewCompanySubmit>
            </form>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function MetaConnectionForm({ orgId, view }: { orgId: string; view: ConnectionView }) {
  const [datasetId, setDatasetId] = useState(view.datasetId ?? "")
  const [accessToken, setAccessToken] = useState("")
  const [testEventCode, setTestEventCode] = useState(view.testEventCode ?? "")
  const { run, pending, result } = useIntegrationAction()

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => saveCompanyMeta(orgId, { datasetId, accessToken, testEventCode }), () => setAccessToken(""))
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
          From the company&apos;s dataset in{" "}
          <HelpLink href="https://business.facebook.com/events_manager2">Events Manager</HelpLink>: Settings, then
          Conversions API, then generate an access token.
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
              if (!confirm("Stop sending this company's lead events to Meta? The saved token is deleted.")) return
              run(() => disconnectCompanyMeta(orgId))
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
