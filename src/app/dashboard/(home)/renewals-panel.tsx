"use client"

import { useState } from "react"
import { Building2 } from "lucide-react"

import type { RenewalItem } from "@/lib/dashboard-panels"
import { cn } from "@/lib/utils"

/**
 * Upcoming renewals, tabbed the way the reference splits them: the contracts
 * you bill for, and the infrastructure you pay for. They answer different
 * questions on different days, which is why they are not one list.
 *
 * The urgency badge earns its colour from how close the date is, not from a
 * stored flag - see src/lib/renewals.ts.
 */
export function RenewalsPanel({
  amc,
  infrastructure,
}: {
  amc: RenewalItem[]
  infrastructure: RenewalItem[]
}) {
  const [tab, setTab] = useState<"amc" | "infra">(
    // Open on whichever has something in it, so the panel is not empty by
    // default on a workspace that only tracks one kind.
    amc.length === 0 && infrastructure.length > 0 ? "infra" : "amc"
  )

  const rows = tab === "amc" ? amc : infrastructure

  return (
    <>
      <div className="flex border-b">
        {(
          [
            { id: "amc" as const, label: "AMC Renewal", count: amc.length },
            { id: "infra" as const, label: "Domain Expiry", count: infrastructure.length },
          ]
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "true" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === entry.id
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {entry.label} ({entry.count})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          {tab === "amc"
            ? "No maintenance contracts coming up."
            : "No domains or hosting coming up."}
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Building2 className="size-4" strokeWidth={1.75} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{row.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{row.detail}</span>
              </span>

              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                  row.days < 0
                    ? "bg-tone-danger-bg text-tone-danger"
                    : row.days <= 14
                      ? "bg-tone-warning-bg text-tone-warning"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {row.dueLabel}
              </span>

              <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {row.dateLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
