import { SetupNotice } from "@/app/dashboard/proposals/setup-notice"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermission } from "@/lib/access"
import { encryptionConfigured } from "@/lib/integrations/crypto"
import { integrationSummaries, integrationsReady } from "@/lib/integrations/store"
import { toConnectionView } from "@/lib/integrations/view"
import { isAdminRole } from "@/lib/permissions"
import { ClaudeForm, MetaStatus } from "./integration-forms"

export const metadata = { title: "Integrations" }

/**
 * The company's own Meta dataset and Claude key.
 *
 * Claude is the company's to connect: read by anyone who may read Settings,
 * changed by the owner and admins. Meta is shown as status only - the
 * platform admin sets it up from the Accounts console. What reaches the
 * browser is whether each is connected, never a key, to anyone, the platform
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
            ads toward the leads that become customers. Set up for you by your platform admin; nothing is sent
            until it is connected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetaStatus view={toConnectionView(summaries.META_CAPI)} />
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
          <ClaudeForm view={toConnectionView(summaries.ANTHROPIC)} editable={editable} />
        </CardContent>
      </Card>
    </div>
  )
}
