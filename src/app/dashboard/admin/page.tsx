import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import prisma from "@/lib/db"
import { requireSuperAdmin } from "@/lib/current-user"
import { ProvisionForm, UserRowActions } from "./admin-controls"

export const metadata = { title: "Accounts" }

/**
 * Operator console. requireSuperAdmin() redirects a tenant back to their own
 * dashboard rather than 403-ing, so guessing this URL reveals nothing.
 *
 * Note what is shown: identity, role, status and COUNTS. Never a client name,
 * an invoice, or an amount. Administering accounts does not come with a back
 * door into customer data, and keeping that boundary visible here is the point.
 */
export default async function AdminPage() {
  const actor = await requireSuperAdmin()

  const [users, recentAudit] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { clients: true, documents: true } },
      },
    }),
    prisma.adminAuditLog.findMany({
      take: 15,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        meta: true,
        createdAt: true,
        actor: { select: { email: true } },
      },
    }),
  ])

  const activeSuperAdmins = users.filter((u) => u.role === "SUPER_ADMIN" && u.status === "ACTIVE").length
  const suspended = users.filter((u) => u.status === "SUSPENDED").length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Accounts</h2>
        <p className="text-muted-foreground">
          {users.length} account{users.length === 1 ? "" : "s"} &middot; {activeSuperAdmins} super
          admin{activeSuperAdmins === 1 ? "" : "s"} &middot; {suspended} suspended
        </p>
      </div>

      <Card>
        <div className="space-y-3 px-(--card-spacing)">
          <div>
            <h3 className="font-heading text-base font-medium">Grant access</h3>
            <p className="text-sm text-muted-foreground">
              Access is closed by default — an account that has not been granted access here is
              refused at sign-in.
            </p>
          </div>
          <ProvisionForm />
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b bg-muted text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Clients</th>
                <th className="p-4 font-medium text-right">Documents</th>
                <th className="p-4 font-medium">Last active</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b transition-colors hover:bg-muted/50">
                  <td className="p-4 font-medium">{u.email}</td>
                  <td className="p-4">
                    <Badge variant={u.role === "SUPER_ADMIN" ? "default" : "outline"}>
                      {u.role === "SUPER_ADMIN" ? "Super admin" : "User"}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge variant={u.status === "SUSPENDED" ? "destructive" : "secondary"}>
                      {u.status === "SUSPENDED" ? "Suspended" : "Active"}
                    </Badge>
                  </td>
                  <td className="p-4 text-right tabular-nums text-muted-foreground">{u._count.clients}</td>
                  <td className="p-4 text-right tabular-nums text-muted-foreground">{u._count.documents}</td>
                  <td className="p-4 text-muted-foreground">
                    {u.lastLoginAt ? u.lastLoginAt.toLocaleDateString() : "Never"}
                  </td>
                  <td className="p-4 text-right">
                    <UserRowActions
                      userId={u.id}
                      email={u.email}
                      role={u.role}
                      status={u.status}
                      isSelf={u.id === actor.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div>
        <h3 className="mb-3 text-xl font-bold tracking-tight">Audit trail</h3>
        <Card>
          <div className="space-y-3 px-(--card-spacing) text-sm">
            {recentAudit.length === 0 && (
              <p className="text-muted-foreground">No account changes recorded yet.</p>
            )}
            {recentAudit.map((entry) => {
              const meta = entry.meta as { email?: string; from?: string; to?: string } | null
              return (
                <div key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
                  <span>
                    <span className="font-medium">{entry.actor.email}</span>{" "}
                    <span className="text-muted-foreground">
                      {entry.action.replace("user.", "").replace("_", " ")}
                    </span>{" "}
                    <span className="font-medium">{meta?.email ?? "an account"}</span>
                    {meta?.from && meta?.to && (
                      <span className="text-muted-foreground"> ({meta.from} &rarr; {meta.to})</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.createdAt.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
