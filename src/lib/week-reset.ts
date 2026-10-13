/**
 * When the board's Completed column last cleared.
 *
 * The column is a worklist, not an archive: left alone it grows forever and
 * the one thing it is good for - seeing what shipped recently - gets harder
 * every week. So the board shows only what was completed since the most
 * recent Sunday.
 *
 * Nothing is deleted or archived by this. Every completed project stays in
 * the list view, in reports and in the figures above the board; it simply
 * stops occupying a card. That is deliberate: a weekly job that archived rows
 * would need a scheduler, and a scheduler that is down on Sunday leaves the
 * product in a state nobody asked for. A derived cutoff is always correct,
 * needs no infrastructure, and cannot run twice.
 *
 * Sunday means Sunday where the operator is. This product reads
 * operator-facing times in IST (see FOLLOW_UP_ZONE in lib/dates.ts), and IST
 * has no daylight saving, so a fixed offset is exact rather than an
 * approximation.
 */

/** Asia/Kolkata, in minutes. Fixed: India has never observed DST. */
const IST_OFFSET_MIN = 330
const MINUTE_MS = 60_000

/**
 * Midnight IST on the most recent Sunday, as an instant.
 *
 * On a Sunday it returns that same morning, so the column clears as the day
 * begins rather than at the end of it.
 */
export function weekResetAt(now = new Date()): Date {
  // Shift into a frame where IST wall-clock reads as UTC, do the calendar
  // arithmetic there, then shift back. Doing it the other way round - finding
  // Sunday in UTC and adding the offset - lands on Sunday 05:30 IST, which
  // would leave Sunday morning's completions on last week's board.
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * MINUTE_MS)
  const sundayAtMidnightIst = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    // getUTCDay() is 0 on Sunday, so subtracting it walks back to Sunday and
    // is a no-op when today already is one.
    shifted.getUTCDate() - shifted.getUTCDay()
  )
  return new Date(sundayAtMidnightIst - IST_OFFSET_MIN * MINUTE_MS)
}

/**
 * Whether a completed project still belongs on the board.
 *
 * `completedAt` is when the card last moved, which is the closest thing to a
 * completion date without a column recording one - the same substitution the
 * project reports make.
 */
export function withinCurrentWeek(completedAt: Date | string, now = new Date()): boolean {
  const at = completedAt instanceof Date ? completedAt : new Date(completedAt)
  if (Number.isNaN(at.getTime())) return true
  return at.getTime() >= weekResetAt(now).getTime()
}

/** "Sunday 19 Oct", for telling the operator when the column next clears. */
const NEXT_RESET_LABEL = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "short",
})

export function nextResetLabel(now = new Date()): string {
  const next = new Date(weekResetAt(now).getTime() + 7 * 24 * 60 * MINUTE_MS)
  return NEXT_RESET_LABEL.format(next)
}
