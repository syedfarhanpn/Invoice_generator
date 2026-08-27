"use client"

import { useEffect, useState } from "react"
import { CircleCheck, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** How long the green confirmation stays up before the button resets. */
const SAVED_VISIBLE_MS = 2000

/**
 * Save button with three states: idle -> saving -> saved -> idle.
 *
 * Presentational on purpose. The editors already own `isSaving` (it also
 * disables Finalize) and their own error handling, so this takes that state
 * as props rather than duplicating it. All the caller adds is `savedAt`:
 * a timestamp bumped on each successful save, which is what re-triggers the
 * confirmation even when two saves in a row both succeed.
 */
export function SaveButton({
  saving,
  savedAt,
  onClick,
  disabled,
}: {
  saving: boolean
  /** Set to Date.now() each time a save succeeds; null before the first one. */
  savedAt: number | null
  onClick: () => void
  disabled?: boolean
}) {
  // Which savedAt has had its confirmation window expire. Derived rather than
  // mirrored: setting "visible" from inside the effect would fire a second
  // render on every save just to show a tick.
  const [expiredAt, setExpiredAt] = useState<number | null>(null)

  useEffect(() => {
    if (savedAt === null) return
    // The effect only schedules; the state change happens later, in the timer.
    const timer = setTimeout(() => setExpiredAt(savedAt), SAVED_VISIBLE_MS)
    // Clearing on re-run matters: a second save restarts the window rather
    // than letting the first timer cut the new confirmation short.
    return () => clearTimeout(timer)
  }, [savedAt])

  const showSaved = savedAt !== null && expiredAt !== savedAt

  // A save already in flight outranks a stale confirmation from the last one.
  const state = saving ? "saving" : showSaved ? "saved" : "idle"

  return (
    <Button
      onClick={onClick}
      size="sm"
      variant="outline"
      disabled={disabled}
      // Announces "Saving..." then "Saved" to screen readers, so the state
      // change is not purely visual.
      aria-live="polite"
    >
      {state === "saving" && (
        <>
          <Spinner label="Saving" className="mr-2" />
          Saving...
        </>
      )}

      {state === "saved" && (
        <>
          <CircleCheck
            className="mr-2 size-4 text-green-600 duration-300 animate-in zoom-in-50 fade-in dark:text-green-500"
            aria-hidden="true"
          />
          Saved
        </>
      )}

      {state === "idle" && (
        <>
          <Save className="w-4 h-4 mr-2" />
          Save
        </>
      )}
    </Button>
  )
}
