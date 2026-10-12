/**
 * The Projects trend: how many started, how many were still open, how many
 * were delivered, month by month.
 *
 * Pure and separate from project-stats.ts because this is the one piece of
 * that file with real arithmetic in it, and arithmetic over date windows is
 * where an off-by-one hides. Everything else there is a count of a filter.
 *
 * "In progress" is measured at the END of each month, not during it. A
 * project that ran all year should appear in every bar, and a count of
 * "projects touched this month" would instead draw activity, which is a
 * different question and one the task list already answers.
 */

export type TrendProject = {
  createdAt: Date
  /** When it last moved. The closest thing to a close date that exists. */
  updatedAt: Date
  /** Set when the project was started from a won deal; otherwise null. */
  startedAt: Date | null
  /** Its stage is WON or LOST - the row is no longer in flight. */
  terminal: boolean
  won: boolean
}

export type ProjectMonth = {
  label: string
  started: number
  /** Open at the end of that month. */
  inProgress: number
  completed: number
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })

/** The first instant of the month `back` months before `now`, in UTC. */
function monthStart(now: Date, back: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
}

/**
 * When the work began.
 *
 * startedAt is only ever set by the convert-from-deal path, so most rows have
 * none and fall back to when the card was made. Reports already make the same
 * substitution; doing it differently here would put two "start dates" in the
 * product.
 */
export function beganAt(project: TrendProject): Date {
  return project.startedAt ?? project.createdAt
}

export function projectTrend(
  projects: TrendProject[],
  now = new Date(),
  months = 6
): ProjectMonth[] {
  return Array.from({ length: months }, (_, i) => {
    const start = monthStart(now, months - 1 - i)
    const end = monthStart(now, months - 2 - i)

    let started = 0
    let inProgress = 0
    let completed = 0

    for (const project of projects) {
      const began = beganAt(project)
      if (began >= start && began < end) started += 1
      if (project.won && project.updatedAt >= start && project.updatedAt < end) completed += 1
      // Had begun by the end of the month, and had not finished by then. The
      // final bar's window ends in the future, so every terminal row is
      // already closed within it and this reduces to "currently active".
      if (began < end && !(project.terminal && project.updatedAt < end)) inProgress += 1
    }

    return { label: MONTH_LABEL.format(start), started, inProgress, completed }
  })
}
