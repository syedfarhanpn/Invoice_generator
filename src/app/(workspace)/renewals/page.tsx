import Link from "next/link"
import { redirect } from "next/navigation"
import type { SubscriptionKind } from "@prisma/client"
import { BarChart3, CalendarClock, PieChart, Wallet } from "lucide-react"

import { DonutChart } from "@/components/app/donut-chart"
import { GroupedBarChart } from "@/components/app/grouped-bar-chart"
import { StatCard, StatRow } from "@/components/app/stat-card"
import {
  RenewalsTabs,
  type RenewalTab,
  type RenewalTabKey,
} from "@/components/workspace/renewals-tabs"
import type { Option, SubscriptionViewRow } from "@/components/workspace/subscriptions-view"
import { hasPermission } from "@/lib/access"
import prisma from "@/lib/db"
import { formatAmount, formatCompactAmount, formatDelta, percentChange } from "@/lib/format-compact"
import { getWorkspaceMembers } from "@/lib/members"
import { dueInCalendarMonth, renewalsByMonth } from "@/lib/renewal-calendar"
import { KIND_LABEL, moduleForKind, URGENCY_DAYS } from "@/lib/renewals"
import { getSubscriptionStats } from "@/lib/subscription-stats"
import { toSubscriptionViewRow } from "@/lib/subscription-view"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"

export const metadata = { title: "Renewals" }

/** The tabs, in the order the reference shows them. */
const TAB_KINDS: Record<RenewalTabKey, SubscriptionKind[]> = {
  amc: ["AMC"],
  domain: ["DOMAIN"],
  hosting: ["HOSTING"],
  other: ["SSL", "EMAIL", "OTHER"],
}

const TAB_META: Record<
  RenewalTabKey,
  { label: string; lead: "cost" | "price"; addLabel: string; emptyMessage: string }
> = {
  amc: {
    label: "AMC",
    lead: "price",
    addLabel: "Add contract",
    emptyMessage: "No maintenance contracts yet. Add one and its renewal date will show up here.",
  },
  domain: {
    label: "Domains",
    lead: "cost",
    addLabel: "Add domain",
    emptyMessage: "No domains tracked yet. Add one and you will be warned before it expires.",
  },
  hosting: {
    label: "Hosting",
    lead: "cost",
    addLabel: "Add hosting",
    emptyMessage: "No hosting tracked yet. Add a plan and its renewal will show up here.",
  },
  other: {
    label: "Other",
    lead: "cost",
    addLabel: "Add service",
    emptyMessage: "Nothing else tracked yet. SSL certificates, mailboxes and anything else that renews belong here.",
  },
}

/**
 * Renewals: AMC, domains and hosting on one screen.
 *
 * They were two pages, which meant that answering "what renews this month"
 * took two visits and a bit of mental addition. They are one table in the
 * database and one job in practice, so the figures here cover all of it and
 * the tabs below split only the list.
 *
 * Two permissions still govern it. AMCs are `renewals`, infrastructure is
 * `domains`, and someone may hold one without the other - so the query only
 * fetches the kinds the viewer may read, the tabs only offer those, and every
 * write re-checks against the row's own kind. Merging the screens did not
 * merge the access.
 *
 * Money keeps the discipline the two pages had: cost and price are opposite
 * directions and are never summed. Margin is derived from them, and is taken
 * over resold services only, because our own domain bills nobody and is
 * overhead rather than a loss-making resale.
 */
export default async function RenewalsPage() {
  // Server-side, before any query runs. Hiding the nav entry is not access
  // control; this is. Either half is enough to open the screen - which half
  // decides what it contains.
  const [canReadAmc, canReadInfra] = await Promise.all([
    hasPermission("renewals", "read"),
    hasPermission("domains", "read"),
  ])
  if (!canReadAmc && !canReadInfra) redirect("/denied?module=renewals")

  const identity = await getWorkspaceIdentity()
  const now = new Date()

  // Only the kinds this viewer may see. Filtering in the query rather than in
  // the component means the rows they may not read never reach the browser.
  const visibleKinds: SubscriptionKind[] = (
    Object.keys(TAB_KINDS) as RenewalTabKey[]
  ).flatMap((key) =>
    TAB_KINDS[key].filter((kind) =>
      moduleForKind(kind) === "renewals" ? canReadAmc : canReadInfra
    )
  )

  const [{ stats, rows, currency }, clients, projects, members] = await Promise.all([
    getSubscriptionStats(identity.userId, visibleKinds, now),
    prisma.client.findMany({
      where: { userId: identity.userId, archivedAt: null },
      orderBy: { businessName: "asc" },
      select: { id: true, businessName: true, fullName: true },
    }),
    prisma.project.findMany({
      where: { userId: identity.userId, archivedAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    getWorkspaceMembers(identity.orgId),
  ])

  const viewRows = rows.map((row) => toSubscriptionViewRow(row, now))

  const clientOptions: Option[] = clients.map((c) => ({
    id: c.id,
    label: c.businessName || c.fullName,
  }))
  const projectOptions: Option[] = projects.map((p) => ({ id: p.id, label: p.title }))
  const memberOptions: Option[] = members.map((m) => ({ id: m.id, label: m.name }))

  // --- the tabs ------------------------------------------------------------
  const tabs: RenewalTab[] = []
  const rowsByTab = {} as Record<RenewalTabKey, SubscriptionViewRow[]>

  for (const key of Object.keys(TAB_KINDS) as RenewalTabKey[]) {
    const kinds = TAB_KINDS[key].filter((k) => visibleKinds.includes(k))
    if (kinds.length === 0) continue
    const meta = TAB_META[key]
    rowsByTab[key] = viewRows.filter((row) => kinds.includes(row.kind as SubscriptionKind))
    tabs.push({
      key,
      label: meta.label,
      kinds: kinds.map((k) => ({ id: k, label: KIND_LABEL[k] })),
      defaultKind: kinds[0],
      lead: meta.lead,
      addLabel: meta.addLabel,
      emptyMessage: meta.emptyMessage,
    })
  }

  // --- the figures ---------------------------------------------------------
  const occurrenceRows = rows.map((row) => ({
    kind: row.kind,
    status: row.status,
    startsOn: row.startsOn,
    renewsOn: row.renewsOn,
    cycle: row.cycle,
  }))

  const dueThisMonth = dueInCalendarMonth(occurrenceRows, 0, now)
  const dueLastMonth = dueInCalendarMonth(occurrenceRows, 1, now)
  // A floor of five: three renewals where there was one is "+200%", which is
  // true and tells the reader only that the denominator was small.
  const monthChange = percentChange(dueThisMonth, dueLastMonth, 5)

  const year = now.getUTCFullYear()
  const months = renewalsByMonth(occurrenceRows, year)

  // The next thirty days, soonest first - the queue of things to act on.
  const upcoming = viewRows
    .filter((row) => row.status === "ACTIVE" && row.days >= 0 && row.days <= URGENCY_DAYS.soon)
    .slice(0, 6)

  const byType = stats.byKind

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Renewals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track AMC, domain and hosting renewals in one place.
          </p>
        </div>
      </header>

      <StatRow>
        <StatCard
          variant="overview"
          href="#renewals"
          label="Total Renewals"
          value={stats.activeCount}
          format="integer"
          icon="done"
          delta={{
            label: tabs.map((t) => t.label).join(", "),
            direction: "flat",
            caption: stats.cancelledCount > 0 ? `${stats.cancelledCount} lapsing` : undefined,
          }}
        />
        <StatCard
          variant="overview"
          href="#renewals"
          label="Due This Month"
          value={dueThisMonth}
          format="integer"
          icon="deadline"
          delta={
            monthChange == null
              ? { label: `${dueLastMonth} last month`, direction: "flat" }
              : {
                  label: formatDelta(monthChange),
                  direction: monthChange >= 0 ? "up" : "down",
                  caption: "vs last month",
                }
          }
        />
        <StatCard
          variant="overview"
          href="#renewals"
          label="Overdue Renewals"
          value={stats.overdueCount}
          format="integer"
          icon="late"
          animate={false}
          delta={
            stats.overdueCount > 0
              ? { label: "requires immediate action", direction: "flat", inverted: true }
              : { label: "nothing lapsed", direction: "flat" }
          }
        />
        <StatCard
          variant="overview"
          href="#renewals"
          label="Upcoming (Next 30 Days)"
          value={stats.dueSoonCount}
          format="integer"
          icon="due"
          delta={{
            label:
              stats.dueSoonCost + stats.dueSoonRevenue > 0
                ? `${formatCompactAmount(stats.dueSoonCost, currency)} out · ${formatCompactAmount(stats.dueSoonRevenue, currency)} in`
                : "nothing imminent",
            direction: "flat",
          }}
        />
      </StatRow>

      {stats.otherCurrencyCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {stats.otherCurrencyCount} record
          {stats.otherCurrencyCount === 1 ? " is" : "s are"} in another currency and{" "}
          {stats.otherCurrencyCount === 1 ? "is" : "are"} not included in the money above.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-xl border bg-card p-5 lg:col-span-8">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Renewals by Month
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Every date each contract comes due in {year}, not just the next one.
              </p>
            </div>
            <span className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: "var(--chart-1)" }} />
                AMC
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: "var(--chart-2)" }} />
                Domain
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: "var(--chart-5)" }} />
                Hosting
              </span>
              <span className="rounded-md border px-2 py-1 text-muted-foreground">{year}</span>
            </span>
          </header>
          <GroupedBarChart
            points={months.map((m) => ({
              label: m.label,
              amc: m.amc,
              domain: m.domain,
              hosting: m.hosting,
              other: m.other,
            }))}
            series={[
              { key: "amc", label: "AMC", color: "var(--chart-1)" },
              { key: "domain", label: "Domain", color: "var(--chart-2)" },
              { key: "hosting", label: "Hosting", color: "var(--chart-5)" },
              { key: "other", label: "Other", color: "var(--chart-4)" },
            ]}
          />
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-4">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <PieChart className="size-4 text-muted-foreground" strokeWidth={1.75} />
            Renewals by Type
          </h2>
          {byType.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing tracked yet.</p>
          ) : (
            <DonutChart slices={byType} centreLabel="Total" format="integer" />
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="rounded-xl border bg-card lg:col-span-8">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Upcoming Renewals
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Next {URGENCY_DAYS.soon} days
              </p>
            </div>
            <Link
              href="#renewals"
              className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              View all
            </Link>
          </header>

          {upcoming.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nothing comes due in the next {URGENCY_DAYS.soon} days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
                    <th scope="col" className="px-5 py-2.5 font-normal">Client</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Project</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Service</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Type</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Expiry Date</th>
                    <th scope="col" className="px-3 py-2.5 font-normal">Days Left</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-5 py-2.5 font-medium">
                        <span className="block max-w-36 truncate">
                          {row.clientName ?? "Ours"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span className="block max-w-32 truncate">
                          {row.projectTitle ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <span className="block max-w-40 truncate">{row.name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.kindLabel}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                        {row.renewsOnLabel}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={
                            row.days <= URGENCY_DAYS.due
                              ? "inline-flex rounded-md bg-tone-danger-bg px-2 py-0.5 text-xs font-medium whitespace-nowrap text-tone-danger"
                              : "inline-flex rounded-md bg-tone-success-bg px-2 py-0.5 text-xs font-medium whitespace-nowrap text-tone-success"
                          }
                        >
                          {row.days === 0 ? "Today" : `${row.days} day${row.days === 1 ? "" : "s"}`}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {/* What the client pays when there is one, otherwise
                            what it costs us. Never the two added together. */}
                        {row.clientName && row.price != null
                          ? formatAmount(row.price, currency)
                          : row.cost != null
                            ? formatAmount(row.cost, currency)
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 lg:col-span-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="size-4 text-muted-foreground" strokeWidth={1.75} />
            The year ahead
          </h2>
          <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
            Annualised across every cycle. Revenue and cost are kept apart - adding them would
            describe neither.
          </p>
          <dl className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">Clients pay</dt>
              <dd className="text-sm font-medium tabular-nums">
                {formatCompactAmount(stats.annualRevenue, currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-muted-foreground">We pay, to resell</dt>
              <dd className="text-sm font-medium tabular-nums">
                {formatCompactAmount(stats.annualCostResold, currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-t pt-3">
              <dt className="text-sm font-medium">Margin</dt>
              <dd
                className={`text-base font-semibold tabular-nums ${
                  stats.annualMargin < 0 ? "text-tone-danger" : "text-tone-success"
                }`}
              >
                {formatCompactAmount(stats.annualMargin, currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-t pt-3">
              <dt className="text-sm text-muted-foreground">Our own, on top</dt>
              <dd className="text-sm font-medium tabular-nums">
                {formatCompactAmount(stats.annualCostOwn, currency)}
              </dd>
            </div>
          </dl>
          {stats.annualMargin < 0 && (
            <p className="mt-3 text-xs text-tone-danger">
              Billed to clients for less than they cost us.
            </p>
          )}
          {stats.autoRenewCount > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              {stats.autoRenewCount} renew{stats.autoRenewCount === 1 ? "s" : ""} automatically -
              budget for {stats.autoRenewCount === 1 ? "it" : "them"} rather than acting on{" "}
              {stats.autoRenewCount === 1 ? "it" : "them"}.
            </p>
          )}
        </section>
      </div>

      <RenewalsTabs
        tabs={tabs}
        rowsByTab={rowsByTab}
        clients={clientOptions}
        projects={projectOptions}
        members={memberOptions}
        currency={currency}
      />
    </div>
  )
}
