"use client"

import { useState } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export type BulkAction = {
  key: string
  label: string
  /** How many of the selected rows this action can actually touch. */
  eligible: number
  variant?: "default" | "outline" | "destructive"
  /** Shown in the confirm prompt. */
  confirm: (eligible: number) => string
  run: () => Promise<{ changed: number; skipped: number }>
}

/**
 * Floating bar shown while rows are selected.
 *
 * Each action reports how many of the selection it can apply to, and disables
 * itself at zero - so "Delete" is visibly unavailable when every selected
 * document is already issued, rather than failing after the click.
 */
export function SelectionBar({
  selectedCount,
  actions,
  onClear,
  onDone,
}: {
  selectedCount: number
  actions: BulkAction[]
  onClear: () => void
  onDone: () => void
}) {
  const [running, setRunning] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (selectedCount === 0) return null

  async function run(action: BulkAction) {
    if (action.eligible === 0) return
    if (!confirm(action.confirm(action.eligible))) return
    setRunning(action.key)
    setMessage(null)
    try {
      const { changed, skipped } = await action.run()
      setMessage(
        skipped > 0
          ? `${changed} updated, ${skipped} skipped.`
          : `${changed} updated.`
      )
      onDone()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "That action failed.")
    } finally {
      setRunning(null)
    }
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-4 z-30 mx-auto flex w-fit max-w-full flex-wrap items-center gap-3 rounded-full border bg-popover px-4 py-2 shadow-lg"
    >
      <span className="text-sm font-medium whitespace-nowrap">
        {selectedCount} selected
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => (
          <Button
            key={action.key}
            size="sm"
            variant={action.variant ?? "outline"}
            disabled={action.eligible === 0 || running !== null}
            onClick={() => run(action)}
            // Explains the disabled state instead of leaving it a mystery.
            // Worded to avoid conjugating the label ("void" -> "voidd").
            title={
              action.eligible === 0
                ? `No selected row is eligible for "${action.label}"`
                : `${action.label} ${action.eligible} of ${selectedCount}`
            }
          >
            {running === action.key ? (
              <>
                <Spinner label={action.label} className="mr-2" /> Working...
              </>
            ) : (
              <>
                {action.label}
                <span className="ml-1.5 text-xs opacity-70">{action.eligible}</span>
              </>
            )}
          </Button>
        ))}
      </div>

      {message && <span className="text-xs text-muted-foreground">{message}</span>}

      <Button
        size="icon"
        variant="ghost"
        onClick={onClear}
        aria-label="Clear selection"
        disabled={running !== null}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}

/** Native checkbox, styled to match. No checkbox primitive exists in ui/. */
export function RowCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate && !checked
      }}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 cursor-pointer accent-primary align-middle"
    />
  )
}
