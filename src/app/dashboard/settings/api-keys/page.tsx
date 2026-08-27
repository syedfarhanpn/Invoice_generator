import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import prisma from "@/lib/db"
import { getCurrentUser } from "@/lib/current-user"
import { maskApiKey } from "@/lib/api-key"
import { KeyManager, RevokeButton } from "./key-manager"

export const metadata = { title: "API keys" }

export default async function ApiKeysPage() {
  const user = await getCurrentUser()

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    select: { id: true, name: true, lookupId: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">API keys</h2>
        <p className="text-muted-foreground">
          Let another system — a CRM, an automation — push clients and draft documents into this
          workspace.
        </p>
      </div>

      <Card>
        <div className="space-y-3 px-(--card-spacing)">
          <h3 className="font-heading text-base font-medium">Create a key</h3>
          <KeyManager />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b bg-muted text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Key</th>
                <th className="p-4 font-medium">Last used</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b transition-colors hover:bg-muted/50">
                  <td className="p-4 font-medium">{k.name}</td>
                  <td className="p-4 font-mono text-xs text-muted-foreground">{maskApiKey(k.lookupId)}</td>
                  <td className="p-4 text-muted-foreground">
                    {k.lastUsedAt ? k.lastUsedAt.toLocaleString() : "Never"}
                  </td>
                  <td className="p-4">
                    <Badge variant={k.revokedAt ? "destructive" : "secondary"}>
                      {k.revokedAt ? "Revoked" : "Active"}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    {!k.revokedAt && <RevokeButton id={k.id} name={k.name} />}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No API keys yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
