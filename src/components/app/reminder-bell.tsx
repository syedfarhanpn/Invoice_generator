"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, X } from "lucide-react"

import { fetchReminders, type ReminderView } from "@/lib/reminder-actions"
import { describeDue, formatLocalTime } from "@/lib/dates"
import { cn } from "@/lib/utils"

/**
 * What is due, in the header.
 *
 * Polls rather than holding a socket open: a reminder that arrives within the
 * minute is on time for this, and a minute of staleness costs nothing next to
 * a connection to keep alive. The count is everything currently due, so it
 * keeps nagging until the task is actually done; the alert fires once per
 * task, which is what notifiedAt on the row is for.
 *
 * Nothing arrives while the app is closed. That is the honest limit of the
 * in-app channel - see src/lib/reminders.ts for where email plugs in.
 */

const POLL_MS = 60_000

export function ReminderBell() {
  const [due, setDue] = useState<ReminderView[]>([])
  const [alert, setAlert] = useState<ReminderView | null>(null)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const poll = useCallback(async () => {
    try {
      const { due: all, fresh } = await fetchReminders()
      setDue(all)
      // One at a time: a stack of toasts on a Monday morning is a wall, not a
      // notification. The rest are in the list behind the bell.
      if (fresh.length > 0) setAlert(fresh[0])
    } catch {
      // A failed poll is not worth surfacing - the next one is a minute away.
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)

    // Catching up immediately after the laptop was shut, rather than waiting
    // out the rest of the interval.
    const onVisible = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [poll])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const overdue = due.filter((r) => r.overdue).length

  return (
    <>
      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={
            due.length === 0
              ? "Reminders: nothing due"
              : `Reminders: ${due.length} due, ${overdue} overdue`
          }
          className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="size-4.5" strokeWidth={1.75} />
          {due.length > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-background",
                overdue > 0 ? "bg-tone-danger" : "bg-tone-info"
              )}
            />
          )}
        </button>

        {open && (
          <div className="absolute top-full right-0 z-50 mt-1.5 w-80 overflow-hidden rounded-xl border bg-popover shadow-lg">
            <header className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Due now</span>
              {due.length > 0 && (
                <span className="text-xs tabular-nums text-muted-foreground">{due.length}</span>
              )}
            </header>

            {due.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">
                Nothing due. Anything you schedule on a task shows up here.
              </p>
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {due.map((reminder) => (
                  <li key={reminder.id}>
                    <Link
                      href="/tasks"
                      onClick={() => setOpen(false)}
                      className="block px-4 py-2.5 transition-colors hover:bg-accent"
                    >
                      <span className="block text-sm break-words">{reminder.title}</span>
                      <span className="mt-0.5 block text-xs">
                        <span
                          className={cn(
                            reminder.overdue ? "text-tone-danger" : "text-muted-foreground"
                          )}
                        >
                          {describeDue(reminder.dueAtIso).label} ·{" "}
                          {formatLocalTime(reminder.dueAtIso)}
                        </span>
                        {reminder.projectTitle && (
                          <span className="text-muted-foreground"> · {reminder.projectTitle}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {alert && <ReminderToast reminder={alert} onClose={() => setAlert(null)} />}
    </>
  )
}

/** Announced once, and it waits to be dismissed - a reminder that vanishes on
 *  its own while you are looking elsewhere has not reminded you of anything. */
function ReminderToast({
  reminder,
  onClose,
}: {
  reminder: ReminderView
  onClose: () => void
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed right-4 bottom-4 z-50 w-80 rounded-xl border bg-popover p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
            reminder.overdue ? "bg-tone-danger-bg text-tone-danger" : "bg-tone-info-bg text-tone-info"
          )}
        >
          <Bell className="size-4" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words">{reminder.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {describeDue(reminder.dueAtIso).label} · {formatLocalTime(reminder.dueAtIso)}
          </p>
          <Link
            href="/tasks"
            onClick={onClose}
            className="mt-2 inline-block text-xs font-medium text-foreground underline underline-offset-2"
          >
            Open tasks
          </Link>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
