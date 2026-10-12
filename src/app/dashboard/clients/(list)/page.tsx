import Link from "next/link"
import { BarChart3, Briefcase, Plus, Users } from "lucide-react"

import { AreaChart } from "@/components/app/area-chart"
import { DonutChart } from "@/components/app/donut-chart"
import { StatCard, StatRow } from "@/components/app/stat-card"
import { buttonVariants } from "@/components/ui/button"
import { requirePermission } from "@/lib/access"
import { getClientStats } from "@/lib/client-stats"
import { currencyDecimals } from "@/lib/currencies"
import prisma from "@/lib/db"
import { formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { paymentSummary } from "@/lib/money"
import { annualEquivalent } from "@/lib/renewals"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

import { ClientsTable, type ClientRow } from "./clients-table"

export const metadata = { title: "Clients" }

/**
 * Clients, laid out as the reference dashboard.
 *
 * The figures come from the clients themselves - their projects and their
 * invoices - rather than from a second aggregate, so a client's revenue here
 * and the payment status on their invoices are the same calculation.
 *
 * Revenue per client is money RECEIVED, capped at what was billed. An
 * overpaid invoice has more paid against it than it was ever worth, and
 * letting that through would make this table disagree with the Documents
 * figures, which derive received as invoiced minus outstanding.
 */
export default async function ClientsPage() {
  // Server-side, before any query runs. Hiding the nav entry is not
  // access control; this is.
  await requirePermission("clients", "read")

  const identity = await getWorkspaceIdentity()
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [stats, clients, amcSubscriptions, projectsThisMonth] = await Promise.all([
    getClientStats(identity.userId),
    prisma.client.findMany({
      where: { userId: identity.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        fullName: true,
        businessName: true,
        email: true,
        phone: true,
        createdAt: true,
        archivedAt: true,
        _count: { select: { documents: true } },
        // The reference's "Type" column.
        companyProfiles: { select: { industry: true }, take: 1 },
        // The named person, when one is recorded.
        contacts: {
          where: { archivedAt: null },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
          select: { firstName: true, lastName: true },
        },
        projects: {
          where: { archivedAt: null },
          select: { stage: { select: { type: true } } },
        },
        documents: {
          where: { type: "INVOICE", status: { notIn: ["DRAFT", "VOID"] } },
          select: {
            totalAmount: true,
            amountPaid: true,
            advanceReceived: true,
            dueDate: true,
            currency: true,
          },
        },
      },
    }),
    // Recurring revenue is what AMCs bill per year, annualised across cycles.
    prisma.subscription.findMany({
      where: { userId: identity.userId, archivedAt: null, status: "ACTIVE", kind: "AMC" },
      select: { price: true, cycle: true, currency: true },
    }),
    prisma.project.count({
      where: { userId: identity.userId, archivedAt: null, createdAt: { gte: monthStart } },
    }),
  ])

  const { currency } = stats
  const decimals = currencyDecimals(currency)
  const toMajor = (minor: number) => minor / 10 ** decimals

  const amcAnnualRevenue = amcSubscriptions.reduce(
    (sum, s) =>
      s.currency === currency && s.price != null
        ? sum + annualEquivalent(Number(s.price), s.cycle)
        : sum,
    0
  )

  const rows: ClientRow[] = clients.map((client) => {
    let receivedMinor = 0
    for (const invoice of client.documents) {
      if (invoice.currency !== currency) continue
      const summary = paymentSummary(
        invoice.totalAmount != null ? Number(invoice.totalAmount) : null,
        Number(invoice.amountPaid),
        invoice.dueDate,
        false,
        invoice.currency,
        Number(invoice.advanceReceived),
        now
      )
      // Capped - see the note at the top of this file.
      receivedMinor += Math.min(summary.paidMinor, summary.totalMinor)
    }

    const contact = client.contacts[0]
    const activeProjects = client.projects.filter((p) => p.stage.type === "OPEN").length

    return {
      id: client.id,
      code: client.code,
      fullName: client.fullName,
      businessName: client.businessName,
      email: client.email,
      phone: client.phone,
      contactPerson: contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
        : null,
      type: client.companyProfiles[0]?.industry ?? null,
      // Three states the data can actually support: archived is explicit,
      // live work is observable, and anything else is a client with nothing
      // currently moving. The reference's "On Hold" is that middle case.
      status: client.archivedAt
        ? ("archived" as const)
        : activeProjects > 0
          ? ("active" as const)
          : ("on-hold" as const),
      projects: client.projects.length,
      revenue: toMajor(receivedMinor),
      joinedOn: client.createdAt.toISOString(),
      documentCount: client._count.documents,
      archived: client.archivedAt !== null,
    }
  })

  const maxRevenue = Math.max(...stats.topByRevenue.map((c) => c.revenue), 1)
  const clientChange = percentChange(stats.total, stats.total - stats.newThisMonth)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your clients, projects, invoices and long-term relationships.
          </p>
        </div>
        <Link href="/dashboard/clients/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="mr-1.5 size-4" /> Add Client
        </Link>
      </header>

      <StatRow>
        <StatCard
          variant="overview"
          href="/dashboard/clients"
          label="Total Clients"
          value={stats.total}
          format="integer"
          icon="clients"
          delta={
            clientChange == null
              ? stats.newThisMonth > 0
                ? { label: `+${stats.newThisMonth}`, direction: "up", caption: "this month" }
                : undefined
              : {
                  label: formatDelta(clientChange),
                  direction: clientChange >= 0 ? "up" : "down",
                  caption: "vs last month",
                }
          }
        />
        <StatCard
          variant="overview"
          href="/projects"
          label="Active Clients"
          value={stats.withOpenWork}
          format="integer"
          icon="done"
          delta={{
            label: `${stats.total - stats.withOpenWork} idle`,
            direction: "flat",
            caption: "a live project or money owed",
          }}
        />
        <StatCard
          variant="overview"
          href="/projects"
          label="Projects from Clients"
          value={stats.projectCount}
          format="integer"
          icon="projects"
          delta={{
            label: `+${projectsThisMonth}`,
            direction: projectsThisMonth > 0 ? "up" : "flat",
            caption: "started this month",
          }}
        />
        <StatCard
          variant="overview"
          href="/renewals"
          label="Recurring Revenue (AMC)"
          value={amcAnnualRevenue}
          format="currency"
          currency={currency}
          icon="money"
          delta={{
            label:
              amcSubscriptions.length > 0
                ? `${amcSubscriptions.length} contract${amcSubscriptions.length === 1 ? "" : "s"}`
                : "none yet",
            direction: "flat",
            caption: amcSubscriptions.length > 0 ? "annualised" : undefined,
          }}
        />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-xl border bg-card p-5 lg:col-span-5">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="size-4 text-muted-foreground" strokeWidth={1.75} />
              Client Growth
            </h2>
            <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
              Last 6 months
            </span>
          </header>
          {/* Cumulative, not per-month: the question "how many clients do we
              have" has a running answer, and a bar chart of joins would hide
              that the base grows. */}
          <AreaChart
            points={stats.growth.map((g) => ({ label: g.label, value: g.total }))}
            noun="clients"
          />
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-3">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Briefcase className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Clients by Type
          </h2>
          <DonutChart slices={stats.byIndustry} centreLabel="Clients" format="integer" />
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Top Revenue Generating Clients
          </h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            By what they have paid, not by what they have been billed.
          </p>

          {stats.topByRevenue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing received yet.</p>
          ) : (
            <ul className="space-y-3">
              {stats.topByRevenue.slice(0, 5).map((client) => (
                <li key={client.id} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate" title={client.name}>
                    {client.name}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-chart-1"
                      style={{ width: `${Math.max((client.revenue / maxRevenue) * 100, 3)}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    {formatCompactAmount(client.revenue, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ClientsTable rows={rows} currency={currency} />
    </div>
  )
}
