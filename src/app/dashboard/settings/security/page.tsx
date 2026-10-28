import { requirePermission } from "@/lib/access"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { getCurrentUser } from "@/lib/current-user"
import prisma from "@/lib/db"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import { maskApiKey } from "@/lib/api-key"
import { MIN_PASSWORD_LENGTH } from "@/lib/password"
import { SubmitButton } from "@/app/login/submit-button"
import { KeyManager, RevokeButton } from "../api-keys/key-manager"
import { changePassword } from "./actions"

export const metadata = { title: "Security & access" }

/**
 * Security and access.
 *
 * Changing your own password is deliberately NOT gated on the settings
 * permission - everyone must be able to do that for their own account. The
 * API keys below are workspace-wide credentials, so those are.
 */
export default async function SecurityPage(props: {
  searchParams: Promise<{ error?: string; updated?: string }>
}) {
  const searchParams = await props.searchParams
  // Both, because this page carries both kinds of thing: a password belongs
  // to the person changing it, API keys authenticate into the workspace and
  // are shared by everyone who may manage it.
  const user = await getCurrentUser()
  const { workspaceId } = await getWorkspaceIdentity()
  await requirePermission("settings", "read")

  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: workspaceId },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            For {user.email}. You&apos;ll need your current password, and everywhere you&apos;re
            signed in stays signed in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={changePassword} className="max-w-md space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
              <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
            </div>
            {searchParams?.error && <p className="text-sm text-destructive">{searchParams.error}</p>}
            {searchParams?.updated === "1" && (
              <p className="text-sm text-muted-foreground">Password updated.</p>
            )}
            <SubmitButton idleLabel="Update password" pendingLabel="Updating..." />
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Let another system - a CRM, an automation - push clients and draft documents into
            this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <KeyManager />

          {apiKeys.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Key</th>
                    <th className="p-3 font-medium">Last used</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="border-b transition-colors last:border-b-0 hover:bg-muted/50">
                      <td className="p-3 font-medium">{k.name}</td>
                      <td className="p-3 font-mono text-xs text-muted-foreground">{maskApiKey(k.lookupId)}</td>
                      <td className="p-3 text-muted-foreground">
                        {k.lastUsedAt ? k.lastUsedAt.toLocaleString() : "Never"}
                      </td>
                      <td className="p-3">
                        <Badge variant={k.revokedAt ? "destructive" : "secondary"}>
                          {k.revokedAt ? "Revoked" : "Active"}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {!k.revokedAt && <RevokeButton id={k.id} name={k.name} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
