import { Eye } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getViewer } from "@/lib/access"
import { requireSuperAdmin } from "@/lib/current-user"
import { formatDocumentDateTime, formatTableDay } from "@/lib/dates"
import prisma from "@/lib/db"
import { ROLE_LABEL } from "@/lib/members"
import { viewingOrgId } from "@/lib/viewing"
import { stopViewingCompany, viewCompany } from "./actions"
import { AddCompanyForm, UserRowActions, ViewCompanySubmit } from "./admin-controls"

export const metadata = { title: "Accounts" }

/**
 * The platform console: every company on the product, and every account.
 *
 * requireSuperAdmin() redirects anyone else back to their own dashboard
 * rather than 403-ing, so guessing this URL reveals nothing. Company owners
 * and their teams never see it - they run their own people from Team
 * Management, inside their company.
 *
 * The lists here carry names and COUNTS, never a client, an invoice or an
 * amount. Seeing inside a company is a separate, deliberate act - View -
 * which is read-only and recorded in the trail at the bottom of this page.
 */

/** The audit trail's verbs, by action key. Unknown keys fall back to the key. */
const AUDIT_VERB: Record<string, string> = {
  "user.provisioned": "granted access to",
  "user.suspended": "suspended",
  "user.restored": "restored",
  "user.role_changed": "changed the role of",
  "user.removed_from_company": "removed",
  "company.created": "added the company",
  "company.viewed": "viewed",
  "company.view_ended": "stopped viewing",
}

const TH = "px-4 py-3 font-medium"
const TD = "px-4 py-3"

export default async function AdminPage() {
  const [actor, viewer] = await Promise.all([requireSuperAdmin(), getViewer()])

  const [companies, users, recentAudit] = await Promise.all([
    prisma.organisation.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        members: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            status: true,
            userId: true,
            user: { select: { email: true, name: true, lastLoginAt: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        memberships: { select: { role: true, org: { select: { name: true } } } },
      },
    }),
    prisma.adminAuditLog.findMany({
      take: 20,
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

  // A company's records are filed under its owner, so that is what the
  // counts are taken against.
  const ownerIds = companies.flatMap((c) => c.members.filter((m) => m.role === "OWNER").map((m) => m.userId))
  const [clientCounts, documentCounts] = await Promise.all([
    prisma.client.groupBy({ by: ["userId"], where: { userId: { in: ownerIds } }, _count: { _all: true } }),
    prisma.document.groupBy({ by: ["userId"], where: { userId: { in: ownerIds } }, _count: { _all: true } }),
  ])
  const clientsByOwner = new Map(clientCounts.map((row) => [row.userId, row._count._all]))
  const documentsByOwner = new Map(documentCounts.map((row) => [row.userId, row._count._all]))

  // The cookie alone, with no company behind it, still makes every write
  // refuse (src/lib/db.ts) - so it still needs the way out offered.
  const viewingCookie = await viewingOrgId()
  const viewing = viewer.viewing ?? (viewingCookie ? { orgId: viewingCookie, orgName: "a company" } : null)
  const suspended = users.filter((u) => u.status === "SUSPENDED").length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Accounts</h2>
        <p className="text-muted-foreground">
          {companies.length} compan{companies.length === 1 ? "y" : "ies"} &middot; {users.length} account
          {users.length === 1 ? "" : "s"} &middot; {suspended} suspended
        </p>
      </div>

      {/* Every write is refused while a company is open, these included, so
          say so up front rather than offering forms that would fail. */}
      {viewing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-tone-warning-bg px-4 py-3 text-sm text-tone-warning">
          <span className="flex items-center gap-2">
            <Eye className="size-4 shrink-0" strokeWidth={1.75} />
            You are viewing {viewing.orgName}. Exit to add companies or change accounts.
          </span>
          <form action={stopViewingCompany}>
            <Button type="submit" size="sm" variant="outline">
              Exit viewing
            </Button>
          </form>
        </div>
      )}

      {!viewing && (
        <Card>
          <div className="space-y-4 px-(--card-spacing)">
            <div>
              <h3 className="font-heading text-base font-medium">Add a company</h3>
              <p className="text-sm text-muted-foreground">
                Creates the company and invites its owner. Owners manage their own team; nobody in a
                company can see this page.
              </p>
            </div>
            <AddCompanyForm />
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight">Companies</h3>
          <p className="text-sm text-muted-foreground">
            Click a company to look through it read-only. They are not notified, and nothing you open
            changes their records.
          </p>
        </div>
        <Card>
          <div className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground">
                <tr>
                  <th className={TH}>Company</th>
                  <th className={TH}>Owner</th>
                  <th className={`${TH} text-right`}>Team</th>
                  <th className={`${TH} text-right`}>Clients</th>
                  <th className={`${TH} text-right`}>Documents</th>
                  <th className={TH}>Last active</th>
                  <th className={`${TH} text-right`}>
                    <span className="sr-only">View</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No companies yet. Add the first one above.
                    </td>
                  </tr>
                )}
                {companies.map((company) => {
                  const owner = company.members.find((m) => m.role === "OWNER") ?? null
                  const lastActive = company.members.reduce<Date | null>((latest, m) => {
                    const at = m.user.lastLoginAt
                    return at && (!latest || at > latest) ? at : latest
                  }, null)
                  const isOpen = viewing?.orgId === company.id
                  const open = viewCompany.bind(null, company.id)

                  return (
                    <tr key={company.id} className="border-b transition-colors last:border-b-0 hover:bg-muted/50">
                      <td className={TD}>
                        <form action={open}>
                          <ViewCompanySubmit variant="name">{company.name}</ViewCompanySubmit>
                        </form>
                        <span className="block text-xs text-muted-foreground">
                          Added {formatTableDay(company.createdAt)}
                        </span>
                      </td>
                      <td className={TD}>
                        {owner ? (
                          <>
                            <span className="block">{owner.user.name || owner.user.email}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[
                                owner.user.name ? owner.user.email : null,
                                owner.status === "INVITED" ? "Invited, not signed in yet" : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </>
                        ) : (
                          <span className="text-tone-warning">No owner</span>
                        )}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-muted-foreground`}>
                        {company.members.length}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-muted-foreground`}>
                        {owner ? (clientsByOwner.get(owner.userId) ?? 0) : "—"}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-muted-foreground`}>
                        {owner ? (documentsByOwner.get(owner.userId) ?? 0) : "—"}
                      </td>
                      <td className={`${TD} whitespace-nowrap text-muted-foreground`}>
                        {formatTableDay(lastActive, "Never")}
                      </td>
                      <td className={`${TD} text-right`}>
                        {isOpen ? (
                          <Badge variant="secondary">Viewing</Badge>
                        ) : (
                          <form action={open}>
                            <ViewCompanySubmit variant="button">View</ViewCompanySubmit>
                          </form>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight">People</h3>
          <p className="text-sm text-muted-foreground">
            Every account on the platform. Suspending someone signs them out of their company at
            their next request; their records are kept.
          </p>
        </div>
        <Card>
          <div className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b bg-muted text-muted-foreground">
                <tr>
                  <th className={TH}>Email</th>
                  <th className={TH}>Company</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Last active</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const membership = u.memberships[0] ?? null
                  return (
                    <tr key={u.id} className="border-b transition-colors last:border-b-0 hover:bg-muted/50">
                      <td className={`${TD} font-medium`}>{u.email}</td>
                      <td className={TD}>
                        {u.role === "SUPER_ADMIN" && <Badge className="mb-1">Platform admin</Badge>}
                        {membership ? (
                          <>
                            <span className="block">{membership.org.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {ROLE_LABEL[membership.role]}
                            </span>
                          </>
                        ) : u.role !== "SUPER_ADMIN" ? (
                          <span className="text-muted-foreground">No company</span>
                        ) : null}
                      </td>
                      <td className={TD}>
                        <Badge variant={u.status === "SUSPENDED" ? "destructive" : "secondary"}>
                          {u.status === "SUSPENDED" ? "Suspended" : "Active"}
                        </Badge>
                      </td>
                      <td className={`${TD} whitespace-nowrap text-muted-foreground`}>
                        {formatTableDay(u.lastLoginAt, "Never")}
                      </td>
                      <td className={`${TD} text-right`}>
                        {viewing ? (
                          <span className="text-xs text-muted-foreground">Exit viewing to change</span>
                        ) : (
                          <UserRowActions
                            userId={u.id}
                            email={u.email}
                            role={u.role}
                            status={u.status}
                            isSelf={u.id === actor.id}
                            removableFrom={membership && membership.role !== "OWNER" ? membership.org.name : null}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-bold tracking-tight">Audit trail</h3>
        <Card>
          <div className="space-y-3 px-(--card-spacing) text-sm">
            {recentAudit.length === 0 && <p className="text-muted-foreground">Nothing recorded yet.</p>}
            {recentAudit.map((entry) => {
              const meta = entry.meta as { email?: string; company?: string | null; from?: string; to?: string } | null
              // Who or what it was done to: the company for company events,
              // the person otherwise - and both for a removal.
              const target = entry.action.startsWith("company.")
                ? meta?.company
                : entry.action === "user.removed_from_company"
                  ? `${meta?.email ?? "an account"} from ${meta?.company ?? "their company"}`
                  : meta?.email
              return (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0"
                >
                  <span>
                    <span className="font-medium">{entry.actor.email}</span>{" "}
                    <span className="text-muted-foreground">{AUDIT_VERB[entry.action] ?? entry.action}</span>{" "}
                    <span className="font-medium">{target ?? "an account"}</span>
                    {meta?.from && meta?.to && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({meta.from} &rarr; {meta.to})
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDocumentDateTime(entry.createdAt)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      </section>
    </div>
  )
}
