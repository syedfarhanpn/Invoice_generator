import Link from "next/link"
import { notFound } from "next/navigation"
import { LogOut } from "lucide-react"

import { logout } from "@/app/login/actions"
import { getPortalData, type PortalProject } from "@/lib/portal"
import { getPortalClient } from "@/lib/portal-auth"
import { formatAmount } from "@/lib/format-compact"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
}

/**
 * The client portal.
 *
 * A client signs in with their own account and sees only their own work.
 * Two separate guarantees hold that up, and neither relies on this file:
 *
 *  - getPortalClient() resolves the client from the Supabase session, not
 *    from anything in the URL, so there is no id to tamper with.
 *  - lib/portal.ts chooses every field it returns, and documents what it
 *    withholds - what the agency pays a supplier, internal scoping notes,
 *    support thread bodies.
 *
 * A client has no workspace User row, so typing /dashboard gets them turned
 * away by getCurrentUser() without this page having to think about it.
 */
export default async function ClientPortalPage() {
  const viewer = await getPortalClient()
  const data = await getPortalData(viewer.id)
  if (!data) notFound()

  const { agency, client, projects, documents, renewals, tickets, currency } = data
  const active = projects.filter((p) => !p.delivered)
  const delivered = projects.filter((p) => p.delivered)
  const openTickets = tickets.filter(
    (t) => t.status === "Open" || t.status === "Being worked on"
  ).length

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <span className="flex items-center gap-3">
            {agency.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agency.logoUrl}
                alt={agency.name}
                className="size-9 rounded-lg border bg-card object-contain"
              />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background">
                {agency.name.charAt(0)}
              </span>
            )}
            <span>
              <span className="block text-sm font-semibold">{agency.name}</span>
              <span className="block text-xs text-muted-foreground">Client portal</span>
            </span>
          </span>

          <span className="flex items-center gap-3">
            <span className="text-right">
              <span className="block text-sm font-medium">{client.name}</span>
              <span className="block text-xs text-muted-foreground">{client.email}</span>
            </span>
            <form action={logout}>
              <button
                type="submit"
                aria-label="Sign out"
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="size-4" strokeWidth={1.75} />
              </button>
            </form>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-5 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Your work with {agency.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything live, in one place. This page updates as the work does.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Figure label="Active projects" value={String(active.length)} />
          <Figure
            label="Outstanding"
            value={formatAmount(data.outstanding, currency)}
            tone={data.outstanding > 0 ? "warning" : "ok"}
            hint={data.outstanding > 0 ? "across your unpaid invoices" : "nothing owed"}
          />
          <Figure label="Open tickets" value={String(openTickets)} />
        </div>

        <Panel title="Projects" empty={projects.length === 0 ? "Nothing here yet." : null}>
          <ul className="divide-y">
            {[...active, ...delivered].map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </ul>
        </Panel>

        <Panel
          title="Invoices and documents"
          empty={documents.length === 0 ? "Nothing issued yet." : null}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs whitespace-nowrap text-muted-foreground">
                  <th scope="col" className="px-5 py-2.5 font-normal">Reference</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Type</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Issued</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Due</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">Amount</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">Balance</th>
                  <th scope="col" className="px-5 py-2.5 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b last:border-0">
                    <td className="px-5 py-2.5 font-medium">
                      {doc.shareSlug ? (
                        <Link
                          href={`/share/${doc.shareSlug}`}
                          className="rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {doc.reference}
                        </Link>
                      ) : (
                        doc.reference
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{doc.kind}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {doc.issuedOn}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {doc.dueOn ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {doc.total != null ? formatAmount(doc.total, doc.currency) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {doc.balance != null ? formatAmount(doc.balance, doc.currency) : "—"}
                    </td>
                    <td className="px-5 py-2.5">
                      {doc.paymentLabel && (
                        <span
                          className={cn(
                            "inline-flex rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            doc.paymentLabel === "Paid"
                              ? "bg-tone-success-bg text-tone-success"
                              : doc.paymentLabel === "Overdue"
                                ? "bg-tone-danger-bg text-tone-danger"
                                : "bg-tone-warning-bg text-tone-warning"
                          )}
                        >
                          {doc.paymentLabel}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Renewals"
          subtitle="Domains, hosting and maintenance we keep running for you."
          empty={renewals.length === 0 ? "Nothing on a renewal cycle." : null}
        >
          <ul className="divide-y">
            {renewals.map((renewal) => (
              <li key={renewal.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{renewal.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {renewal.kind} · {renewal.cycleLabel}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm whitespace-nowrap tabular-nums">
                    {renewal.renewsOn}
                  </span>
                  <span
                    className={cn(
                      "block text-xs",
                      renewal.urgency === "overdue" || renewal.urgency === "due"
                        ? "text-tone-danger"
                        : "text-muted-foreground"
                    )}
                  >
                    {renewal.dueLabel}
                  </span>
                </span>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums">
                  {renewal.price != null ? formatAmount(renewal.price, renewal.currency) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Support" empty={tickets.length === 0 ? "No tickets raised." : null}>
          <ul className="divide-y">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{ticket.subject}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ticket.reference} · raised {ticket.raisedOn}
                  </span>
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                  {ticket.status}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <footer className="pt-2 pb-8 text-center text-xs text-muted-foreground">
          <p>
            Questions? Reach {agency.name}
            {agency.email && (
              <>
                {" at "}
                <a href={`mailto:${agency.email}`} className="underline underline-offset-2">
                  {agency.email}
                </a>
              </>
            )}
            {agency.phone && <> or {agency.phone}</>}.
          </p>
        </footer>
      </main>
    </div>
  )
}

function Figure({
  label,
  value,
  hint,
  tone = "ok",
}: {
  label: string
  value: string
  hint?: string
  tone?: "ok" | "warning"
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-[28px] leading-none font-semibold tracking-tight tabular-nums",
          tone === "warning" && "text-tone-danger"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Panel({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string
  subtitle?: string
  empty: string | null
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      {empty ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        children
      )}
    </section>
  )
}

function ProjectRow({ project }: { project: PortalProject }) {
  const progress = project.progress ?? 0
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{project.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {project.category ? `${project.category} · ` : ""}
            Started {project.startedOn}
            {project.dueOn && (
              <>
                {" · "}
                <span className={project.late ? "text-tone-danger" : undefined}>
                  due {project.dueOn}
                </span>
              </>
            )}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            project.delivered
              ? "bg-tone-success-bg text-tone-success"
              : "bg-tone-info-bg text-tone-info"
          )}
        >
          {project.status}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              "block h-full rounded-full",
              project.delivered ? "bg-tone-success" : "bg-chart-1"
            )}
            style={{ width: `${project.delivered ? 100 : progress}%` }}
          />
        </span>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {project.delivered ? "100%" : project.progress != null ? `${progress}%` : "—"}
        </span>
      </div>

      {project.totalTasks > 0 && !project.delivered && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {project.totalTasks - project.openTasks} of {project.totalTasks} task
          {project.totalTasks === 1 ? "" : "s"} done
        </p>
      )}
    </li>
  )
}
