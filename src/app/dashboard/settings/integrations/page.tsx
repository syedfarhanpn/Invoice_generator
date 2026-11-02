import { SetupNotice } from "@/app/dashboard/proposals/setup-notice"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermission } from "@/lib/access"
import { formatTableDay } from "@/lib/dates"
import { encryptionConfigured } from "@/lib/integrations/crypto"
import { integrationSummaries, integrationsReady, type IntegrationSummary } from "@/lib/integrations/store"
import { isAdminRole } from "@/lib/permissions"
import { ClaudeForm, MetaForm, type ConnectionView } from "./integration-forms"

export const metadata = { title: "Integrations" }

/**
 * The company's own Meta dataset and Claude key.
 *
 * Read by anyone who may read Settings, changed only by the owner and
 * admins. What reaches the browser is whether each is connected and the last
 * four characters of the key - never the key itself, to anyone, the platform
 * admin viewing the company included.
 */
export default async function IntegrationsPage() {
  const viewer = await requirePermission("settings", "read")

  if (!(await integrationsReady()) || !viewer.orgId) {
    return (
      <SetupNotice title="Integrations need a one-time database update">
        Run <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npm run db:migrate</code> in the
        project folder, then reload this page. Until then, Meta and Claude keep using the server&apos;s own
        settings, as before.
      </SetupNotice>
    )
  }

  const canManage = isAdminRole(viewer.role, viewer.status)
  const keyReady = encryptionConfigured()
  const editable = canManage && keyReady
  const summaries = await integrationSummaries(viewer.orgId)

  return (
    <div className="space-y-5">
      {!keyReady && (
        <SetupNotice title="The server is missing its encryption key">
          Keys are encrypted before they are saved, with{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">INTEGRATIONS_SECRET_KEY</code>. Add it to
          the server&apos;s environment and restart, then connect your accounts here.
        </SetupNotice>
      )}

      {!canManage && (
        <p className="text-sm text-muted-foreground">
          {viewer.viewing
            ? "Viewing read-only. Keys are never shown here, only whether they are connected."
            : "Only your company's owner or an admin can change these."}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Meta Conversions API</CardTitle>
          <CardDescription>
            Reports each lead&apos;s stage to your own dataset in Meta Events Manager, so Meta can steer your
            ads toward the leads that become customers. Nothing is sent until this is connected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetaForm view={toView(summaries.META_CAPI)} editable={editable} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claude</CardTitle>
          <CardDescription>
            Writes your proposals. Uses your company&apos;s own Anthropic API key, so the cost is billed to your
            Anthropic account. Proposals cannot be written until a key is added.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClaudeForm view={toView(summaries.ANTHROPIC)} editable={editable} />
        </CardContent>
      </Card>
    </div>
  )
}

/** Dates formatted here, so the client receives plain strings. */
function toView(summary: IntegrationSummary): ConnectionView {
  return {
    connected: summary.connected,
    readable: summary.readable,
    hint: summary.hint,
    datasetId: summary.datasetId,
    testEventCode: summary.testEventCode,
    updatedLabel: summary.updatedAt ? formatTableDay(summary.updatedAt) : null,
  }
}
