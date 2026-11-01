import { DocumentSurface } from "@/components/app/document-surface"
import type { ProposalView, SectionKey } from "@/lib/proposals/view"
import { cn } from "@/lib/utils"

/**
 * The proposal on screen.
 *
 * Renders from the same ProposalView as the PDF, on the same paper and in the
 * same typeface, as one continuous sheet rather than A4 pages - the PDF is
 * where pagination matters. Tables fold into stacked rows on a phone.
 */

const LABEL = "text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"

function SectionHead({ view, section }: { view: ProposalView; section: SectionKey }) {
  const entry = view.sections.find((s) => s.key === section)
  if (!entry) return null
  return (
    <div className="mb-5 flex items-end justify-between border-b pb-2">
      <span className="text-3xl font-bold leading-none text-muted-foreground">{entry.number}</span>
      <h2 className="text-xs font-bold uppercase tracking-[0.16em]">{entry.title}</h2>
    </div>
  )
}

function Headline({ children }: { children: string }) {
  if (!children) return null
  return <p className="mb-6 text-base font-bold uppercase leading-snug tracking-wide sm:text-lg">{children}</p>
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden="true" className="text-muted-foreground">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Head row on wide screens; each row stacks its cells, labelled, on narrow ones. */
function Table({
  head,
  rows,
  cols,
  alignRight = [],
  total,
}: {
  head: string[]
  rows: string[][]
  /** Tailwind grid template for sm and up. */
  cols: string
  alignRight?: number[]
  total?: string[]
}) {
  const cell = (i: number) => cn(alignRight.includes(i) && "sm:text-right", i === 0 && "font-semibold")
  return (
    <div className="text-sm">
      <div className={cn("hidden border-b pb-1.5 sm:grid sm:gap-4", cols)}>
        {head.map((h, i) => (
          <span key={i} className={cn(LABEL, alignRight.includes(i) && "text-right")}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((row, r) => (
        <div key={r} className={cn("grid gap-1 border-b border-border/50 py-2.5 sm:gap-4", cols)}>
          {row.map((value, i) => (
            <div key={i} className={cell(i)}>
              {i > 0 && <span className={cn(LABEL, "mr-2 sm:hidden")}>{head[i]}</span>}
              {value}
            </div>
          ))}
        </div>
      ))}
      {total && (
        <div className={cn("grid gap-1 border-t pt-2.5 font-bold sm:gap-4", cols)}>
          {total.map((value, i) => (
            <div key={i} className={cn(alignRight.includes(i) && "sm:text-right")}>
              {value}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Timeline({ view }: { view: ProposalView }) {
  const { phases, ticks, totalDays } = view.timeline
  if (!totalDays || phases.length === 0) return null
  const pct = (days: number) => `${(days / totalDays) * 100}%`

  return (
    <div className="mb-8 overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="ml-40 flex border-b border-border/50 pb-1">
          {ticks.map((tick) => (
            <span key={tick.label} className="text-[10px] text-muted-foreground" style={{ width: pct(tick.end - tick.start + 1) }}>
              {tick.label}
            </span>
          ))}
        </div>
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center py-1.5">
            <span className="w-40 shrink-0 pr-3 text-[11px] font-bold uppercase tracking-wide">{phase.name}</span>
            <div className="relative h-3 flex-1">
              <div
                className="absolute inset-y-0 rounded-[2px] bg-foreground"
                style={{
                  left: pct(phase.startDay - 1),
                  width: pct(Math.max(phase.endDay - phase.startDay + 1, 0.6)),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function dayRange(start: number, end: number): string {
  return start === end ? String(start) : `${start}–${end}`
}

export function ProposalDocument({
  view,
  paper,
  font,
}: {
  view: ProposalView
  paper?: string | null
  font?: string | null
}) {
  return (
    <DocumentSurface
      paper={paper}
      font={font}
      className="mx-auto w-full max-w-[820px] rounded-xl border px-4 py-8 shadow-sm sm:px-12 sm:py-12"
    >
      {/* Cover */}
      <section className="flex min-h-[420px] flex-col justify-between gap-12 border-b pb-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="text-sm font-bold uppercase tracking-[0.2em]">{view.clientLabel}</span>
          <span className="text-right text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {view.dateLabel}
            <br />
            Proposal {view.ref}
          </span>
        </div>
        <div>
          <h1 className="text-4xl font-bold uppercase leading-[1.05] tracking-tight sm:text-6xl">
            {view.cover.projectName}
          </h1>
          {view.cover.tagline && (
            <p className="mt-5 max-w-xl text-sm uppercase leading-relaxed tracking-wide text-muted-foreground">
              {view.cover.tagline}
            </p>
          )}
        </div>
        <dl className="space-y-1.5 border-t pt-4 text-sm">
          {[
            ["For", view.cover.forLine],
            ["By", view.cover.byLine],
            ["Valid", view.cover.validLine],
          ].map(([key, value]) => (
            <div key={key} className="flex gap-4">
              <dt className={cn(LABEL, "w-12 shrink-0 pt-0.5")}>{key}</dt>
              <dd className="uppercase tracking-wide">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* At a glance */}
      <section className="grid gap-10 border-b py-10 sm:grid-cols-[1fr_14rem]">
        <dl>
          {view.glance.map((row) => (
            <div key={row.label} className="flex items-end justify-between gap-4 border-b border-border/50 py-3">
              <dt className={LABEL}>{row.label}</dt>
              <dd className="text-right text-lg font-bold tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className={cn(LABEL, "mb-2")}>Contents</p>
          <ol className="space-y-1.5 text-sm">
            {view.sections.map((s) => (
              <li key={s.key} className="flex gap-3 uppercase tracking-wide">
                <span className="w-6 font-bold text-muted-foreground">{s.number}</span>
                {s.title}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b py-10">
        <SectionHead view={view} section="summary" />
        <Headline>{view.summary.headline}</Headline>
        {view.summary.needs.length > 0 && (
          <Table
            head={["Your need", "What we deliver"]}
            cols="sm:grid-cols-[2fr_3fr]"
            rows={view.summary.needs.map((row) => [row.need, row.delivery])}
          />
        )}
        <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
          {[
            { label: "Client", party: view.parties.client },
            { label: "Service provider", party: view.parties.issuer },
          ].map(({ label, party }) => (
            <div key={label}>
              <p className={LABEL}>{label}</p>
              <p className="mt-1 font-bold">{party.heading}</p>
              {party.lines.map((line, i) => (
                <p key={i} className="text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="border-b py-10">
        <SectionHead view={view} section="scope" />
        <Headline>{view.scope.headline}</Headline>
        <div className="grid gap-x-10 gap-y-8 text-sm sm:grid-cols-2">
          {view.scope.modules.map((module, i) => (
            <div key={i}>
              {module.label && <p className={LABEL}>{module.label}</p>}
              <h3 className="mb-2 mt-0.5 font-bold uppercase tracking-wide">{module.title}</h3>
              <Bullets items={module.items} />
            </div>
          ))}
        </div>
      </section>

      {view.howItWorks && (
        <section className="border-b py-10">
          <SectionHead view={view} section="howItWorks" />
          <Headline>{view.howItWorks.headline}</Headline>
          {view.howItWorks.flow.length > 0 && (
            <div className="mb-8 rounded-lg border bg-muted px-4 py-3">
              <p className={cn(LABEL, "mb-1")}>Flow</p>
              <p className="text-xs font-bold uppercase leading-relaxed tracking-wide">
                {view.howItWorks.flow.join("  ›  ")}
              </p>
            </div>
          )}
          {view.howItWorks.stages.length > 0 && (
            <div className="mb-8">
              <Table
                head={["Stage", "What happens"]}
                cols="sm:grid-cols-[1fr_3fr]"
                rows={view.howItWorks.stages.map((s) => [s.name, s.description])}
              />
            </div>
          )}
          {view.howItWorks.roles.length > 0 && (
            <div className="mb-6">
              <p className={cn(LABEL, "mb-2")}>Users &amp; access</p>
              <Table
                head={["Role", "Platform", "Can do"]}
                cols="sm:grid-cols-[1.2fr_1fr_3fr]"
                rows={view.howItWorks.roles.map((r) => [r.role, r.platform, r.canDo])}
              />
            </div>
          )}
          {view.howItWorks.note && <p className="text-sm text-muted-foreground">{view.howItWorks.note}</p>}
        </section>
      )}

      <section className="border-b py-10">
        <SectionHead view={view} section="timeline" />
        <Headline>{view.timeline.headline}</Headline>
        <Timeline view={view} />
        {view.timeline.phases.length > 0 && (
          <Table
            head={["Days", "Phase", "Deliverable"]}
            cols="sm:grid-cols-[5rem_1.3fr_3fr]"
            rows={view.timeline.phases.map((p) => [dayRange(p.startDay, p.endDay), p.name, p.deliverable])}
          />
        )}
      </section>

      <section className="border-b py-10">
        <SectionHead view={view} section="commercials" />
        <p className="text-4xl font-bold tabular-nums">{view.commercials.total}</p>
        <p className={cn(LABEL, "mb-8 mt-1")}>Total project cost</p>
        {view.commercials.items.length > 0 && (
          <div className="mb-8">
            <Table
              head={["Item", "Amount"]}
              cols="sm:grid-cols-[3fr_1fr]"
              alignRight={[1]}
              rows={view.commercials.items.map((item) => [item.label, item.value])}
              total={["Total project cost", view.commercials.total]}
            />
          </div>
        )}
        {view.commercials.schedule.length > 0 && (
          <div className="mb-8">
            <p className={cn(LABEL, "mb-2")}>Payment schedule</p>
            <Table
              head={["Milestone", "Share", "Amount"]}
              cols="sm:grid-cols-[3fr_5rem_1fr]"
              alignRight={[1, 2]}
              rows={view.commercials.schedule.map((m) => [m.milestone, `${m.percent}%`, m.amount])}
            />
          </div>
        )}
        {view.commercials.exclusions.length > 0 && (
          <div className="text-sm">
            <p className={cn(LABEL, "mb-2")}>Not included</p>
            <Bullets items={view.commercials.exclusions} />
          </div>
        )}
      </section>

      <section className="pt-10">
        <SectionHead view={view} section="terms" />
        <dl className="text-sm">
          {view.terms.map((term, i) => (
            <div key={i} className="grid gap-1 border-b border-border/50 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
              <dt className={cn(LABEL, "pt-0.5")}>{term.label}</dt>
              <dd>{term.text}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 grid gap-1 rounded-lg border bg-muted p-4 text-sm sm:grid-cols-[9rem_1fr] sm:gap-4">
          <span className={cn(LABEL, "pt-0.5")}>Confirm</span>
          <p>{view.acceptance}</p>
        </div>
      </section>
    </DocumentSurface>
  )
}
