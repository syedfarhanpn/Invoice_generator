"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlarmClock,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  CircleDollarSign,
  FolderKanban,
  MoreHorizontal,
  ListChecks,
  Receipt,
  Send,
  TriangleAlert,
  UsersRound,
  Wallet,
} from "lucide-react"

import { formatValue, type ValueFormat } from "@/lib/format-compact"
import { cn } from "@/lib/utils"

/**
 * A headline figure.
 *
 * The number counts up the first time the card is scrolled into view, and only
 * then. Re-running it whenever a filter changes would turn a flourish into a
 * flicker on every interaction, and the figure is business information before
 * it is decoration - §18 of the brief is explicit that access to it is never
 * delayed by animation. The final text is rendered immediately for assistive
 * technology; only the visual digits animate.
 */

export type StatDelta = {
  /** Pre-formatted, e.g. "+28%". */
  label: string
  direction: "up" | "down" | "flat"
  /** "vs last month". Omitted when the delta speaks for itself. */
  caption?: string
  /** True when a rise is bad news - overdue money, cancelled projects. */
  inverted?: boolean
}

/**
 * Icons by name.
 *
 * A Server Component cannot hand a component reference across the boundary
 * either - a lucide icon is a forwardRef object, and React refuses it with
 * "Only plain objects can be passed". Naming it keeps the prop a string.
 */
const STAT_ICONS = {
  wallet: Wallet,
  receipt: Receipt,
  clients: UsersRound,
  projects: FolderKanban,
  money: CircleDollarSign,
  due: AlarmClock,
  deadline: CalendarClock,
  done: CircleCheck,
  late: TriangleAlert,
  delivered: Send,
  tasks: ListChecks,
} as const

export type StatIcon = keyof typeof STAT_ICONS

const DURATION_MS = 850

/** Decelerating, so the figure settles rather than stopping dead. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Counts from zero to `value` once, when the element first becomes visible.
 *
 * Returns the live number plus a ref to attach. Honours prefers-reduced-motion
 * by jumping straight to the end - the point is that the figure is readable,
 * not that it moved.
 */
function useCountUp(value: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(enabled ? 0 : value)
  // Animate once per mount. A revalidation that changes the figure updates it
  // in place rather than replaying the count. State rather than a ref, because
  // the render-time reconciliation below has to read it, and refs are not
  // render-safe.
  // True once the figure on screen is the real one. Set when the count
  // FINISHES, never when it starts - an earlier version flipped a flag on
  // start, that flag was in the effect's dependencies, and the resulting
  // re-run cancelled the animation frame one tick after requesting it. Every
  // card sat at zero.
  const [settled, setSettled] = useState(!enabled)

  // Guards against a second start. A ref because it must not re-run the
  // effect, and it is only ever read inside callbacks - never during render.
  const startedRef = useRef(false)

  // The animation reads the latest figure through a ref, so a revalidation
  // mid-count retargets smoothly instead of restarting the count.
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  // A figure arriving after the count has played is adopted during render,
  // not from an effect: syncing it in an effect paints the stale number first
  // and corrects it on a second pass, which is a flicker on every
  // revalidation as well as a cascading render.
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (settled) setShown(value)
  }

  useEffect(() => {
    if (!enabled) return
    const node = ref.current
    if (!node) return

    let frame = 0
    let start = 0
    let done = false

    /**
     * Abandon the animation and show the real figure.
     *
     * The guiding rule for this whole hook: a count-up that cannot finish
     * must leave the TRUE number on screen, never a partial one. An earlier
     * version counted up from zero and relied on the animation completing,
     * so a card in a background tab sat reading "1" when the answer was 4 -
     * not merely unanimated, but wrong. Every path that can stop the
     * animation now ends here.
     */
    const snap = () => {
      if (done) return
      done = true
      cancelAnimationFrame(frame)
      setShown(valueRef.current)
      setSettled(true)
    }

    const step = (now: number) => {
      if (done) return
      if (!start) start = now
      const progress = Math.min(1, (now - start) / DURATION_MS)
      setShown(valueRef.current * easeOut(progress))
      if (progress < 1) frame = requestAnimationFrame(step)
      // Land exactly on the figure rather than on an eased approximation.
      else snap()
    }

    const canAnimate = () =>
      document.visibilityState === "visible" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // Armed here rather than inside the observer, so it covers the case where
    // the observer never fires at all. Timers are throttled in a background
    // tab but still run, unlike requestAnimationFrame which is suspended
    // outright. Generous, because it should only ever win when something has
    // gone wrong.
    const backstop = setTimeout(snap, DURATION_MS * 3)

    // A tab hidden mid-count would freeze the digits part-way. Snapping on
    // the way out means the figure is right whenever it is looked at again.
    const onHidden = () => {
      if (document.visibilityState !== "visible") snap()
    }
    document.addEventListener("visibilitychange", onHidden)

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || startedRef.current) return
        startedRef.current = true
        observer.disconnect()
        // Reduced motion, or a tab that cannot run frames, still gets the
        // number - just not the journey.
        if (!canAnimate()) {
          snap()
          return
        }
        frame = requestAnimationFrame(step)
      },
      { threshold: 0.25 }
    )
    observer.observe(node)

    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", onHidden)
      cancelAnimationFrame(frame)
      clearTimeout(backstop)
    }
    // Deliberately not depending on `value` or `settled`: either would tear
    // down a running animation. The ref above carries value changes instead.
  }, [enabled])

  return { ref, shown }
}

export function StatCard({
  label,
  value,
  /** Named, not a closure: see the note in src/lib/format-compact.ts. */
  format,
  currency,
  hint,
  delta,
  icon,
  /** Off for figures where a count-up would be noise, like a single-digit count. */
  animate = true,
  variant = "default",
  href,
}: {
  label: string
  value: number
  format: ValueFormat
  currency?: string
  hint?: string
  delta?: StatDelta
  icon?: StatIcon
  animate?: boolean
  /** "overview" wears the reference dashboard layout. See the note below. */
  variant?: "default" | "overview"
  /** Where the corner control goes. Only read by the overview variant. */
  href?: string
}) {
  const { ref, shown } = useCountUp(value, animate)
  const Icon = icon ? STAT_ICONS[icon] : null

  // A rise is usually good, but not for overdue money. `inverted` flips which
  // direction earns the warning colour without flipping the arrow, which still
  // has to point the way the number actually moved.
  //
  // "flat" with inverted is the third case: a standing warning like "2 leads
  // with no next action". It is a count, not a movement, so it earns the
  // colour but no arrow - an arrow would claim a direction it does not have.
  const standingWarning = delta?.direction === "flat" && delta.inverted
  const good = delta && !standingWarning && (delta.inverted ? delta.direction === "down" : delta.direction === "up")
  const bad =
    delta &&
    (standingWarning || (delta.inverted ? delta.direction === "up" : delta.direction === "down"))
  const Arrow = delta?.direction === "down" ? ArrowDownRight : ArrowUpRight

  return (
    <div
      ref={ref}
      className="rounded-xl border bg-card p-5 transition-colors hover:border-muted-foreground/25"
    >
      {/* Two headers, one card. The overview wears the reference dashboard's
          arrangement - icon beside the title, a way into the module on the
          right - while every other screen keeps the original. Sharing the
          component rather than forking it is what keeps the count-up, the
          screen-reader value and the delta colours identical across both. */}
      {variant === "overview" ? (
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
            <span className="truncate text-sm font-medium">{label}</span>
          </span>
          {href && (
            // A real link, not a decorative "..." - a control that looks
            // pressable and does nothing is worse than no control.
            <Link
              href={href}
              aria-label={`Open ${label}`}
              className="shrink-0 rounded-md p-0.5 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-4" strokeWidth={2} />
            </Link>
          )}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {Icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
          )}
        </div>
      )}

      {/* tabular-nums holds the width steady while the digits run, so the card
          does not jitter as the count climbs. */}
      <div className={cn("mt-3 leading-none font-semibold tracking-tight tabular-nums", variant === "overview" ? "text-[32px]" : "text-[28px]")}>
        {/* The settled value for screen readers; the animating one is hidden
            from them so it is not announced sixty times a second. */}
        <span className="sr-only">{formatValue(value, format, currency)}</span>
        <span aria-hidden>{formatValue(shown, format, currency)}</span>
      </div>

      {(delta || hint) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                good && "text-tone-success",
                bad && "text-tone-danger",
                !good && !bad && "text-muted-foreground"
              )}
            >
              {delta.direction !== "flat" && <Arrow className="size-3.5" strokeWidth={2.5} />}
              {delta.label}
            </span>
          )}
          {delta?.caption && <span className="text-muted-foreground">{delta.caption}</span>}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  )
}

/** The row the references put at the top of every module. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
}
