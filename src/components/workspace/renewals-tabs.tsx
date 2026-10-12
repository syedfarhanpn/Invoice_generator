"use client"

import { useMemo, useState } from "react"
import { Globe, Server, ShieldCheck, Sparkles } from "lucide-react"

import {
  SubscriptionsView,
  type Option,
  type SubscriptionViewRow,
} from "@/components/workspace/subscriptions-view"
import { cn } from "@/lib/utils"

/**
 * AMC, Domains, Hosting and anything else, as tabs over one table.
 *
 * They were two screens until now, which meant an operator chasing "what
 * renews this month" had to visit both and add up. They are one table in the
 * database and one job in practice, so they are one screen here.
 *
 * What still differs per tab is which direction the money runs. An AMC is
 * something a client pays us, so its table leads with what they pay; a domain
 * is something we pay for, so its table leads with what it costs. That is why
 * `lead` is per tab rather than per page.
 *
 * Only tabs the viewer may read are rendered, and the server has already
 * left the other rows out of `rows` entirely - this is the courtesy half.
 * The gate is requirePermission() on the page and assertPermission() inside
 * every action, both keyed on the row's own kind.
 */

export type RenewalTabKey = "amc" | "domain" | "hosting" | "other"

export type RenewalTab = {
  key: RenewalTabKey
  label: string
  /** The kinds this tab shows, as the form's kind options. */
  kinds: Option[]
  /** What a new row in this tab starts as. */
  defaultKind: string
  /** Which money column leads. */
  lead: "cost" | "price"
  addLabel: string
  emptyMessage: string
}

const TAB_ICON: Record<RenewalTabKey, typeof ShieldCheck> = {
  amc: ShieldCheck,
  domain: Globe,
  hosting: Server,
  other: Sparkles,
}

export function RenewalsTabs({
  tabs,
  rowsByTab,
  clients,
  projects,
  members,
  currency,
}: {
  tabs: RenewalTab[]
  rowsByTab: Record<RenewalTabKey, SubscriptionViewRow[]>
  clients: Option[]
  projects: Option[]
  members: Option[]
  currency: string
}) {
  const [active, setActive] = useState<RenewalTabKey>(tabs[0]?.key ?? "amc")

  // A tab can vanish if the viewer's access changes under them; falling back
  // to the first one is better than rendering an empty table with no way out.
  const tab = useMemo(
    () => tabs.find((t) => t.key === active) ?? tabs[0],
    [tabs, active]
  )

  if (!tab) return null

  return (
    <div className="space-y-3" id="renewals">
      <div
        role="tablist"
        aria-label="Renewal type"
        className="flex flex-wrap items-center gap-1 border-b"
      >
        {tabs.map((t) => {
          const Icon = TAB_ICON[t.key]
          const selected = t.key === tab.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(t.key)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                selected
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              {t.label}
              <span className="tabular-nums opacity-70">({rowsByTab[t.key].length})</span>
            </button>
          )
        })}
      </div>

      <SubscriptionsView
        // Remounts on a tab change, so the search box and the page number do
        // not carry a filter from one tab into the next.
        key={tab.key}
        rows={rowsByTab[tab.key]}
        kinds={tab.kinds}
        defaultKind={tab.defaultKind}
        clients={clients}
        projects={projects}
        members={members}
        currency={currency}
        addLabel={tab.addLabel}
        emptyMessage={tab.emptyMessage}
        lead={tab.lead}
      />
    </div>
  )
}
