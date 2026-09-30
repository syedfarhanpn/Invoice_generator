import prisma from "@/lib/db"

/**
 * What is due, and who gets told.
 *
 * Delivery sits behind a channel interface so email can be added without
 * touching the query or the bell. Today there is one channel - the app itself
 * - which means nothing arrives while the app is shut. That is a real limit,
 * not an oversight: reaching a closed browser needs a scheduled job on the
 * host, and that is the next phase.
 */

export type DueReminder = {
  id: string
  title: string
  /** The instant that made it due: its reminder if set, otherwise its deadline. */
  dueAt: Date
  overdue: boolean
  projectTitle: string | null
}

export type ReminderChannel = {
  name: string
  deliver(userId: string, reminders: DueReminder[]): Promise<void>
}

/**
 * Open tasks whose moment has arrived.
 *
 * remindAt wins when set, because "tell me the morning before" is a different
 * fact from the deadline itself; a task with neither is not a reminder at all
 * and never appears here.
 */
export async function dueReminders(userId: string, now: Date = new Date()): Promise<DueReminder[]> {
  const rows = await prisma.task.findMany({
    where: {
      userId,
      status: "OPEN",
      OR: [
        { remindAt: { not: null, lte: now } },
        // Only falls back to the deadline when no reminder was set, or a task
        // told to warn you next week would also fire on its due date.
        { remindAt: null, dueAt: { not: null, lte: now } },
      ],
    },
    orderBy: [{ dueAt: "asc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      dueAt: true,
      remindAt: true,
      project: { select: { title: true } },
    },
  })

  return rows.map((row) => {
    const at = row.remindAt ?? row.dueAt!
    return {
      id: row.id,
      title: row.title,
      dueAt: at,
      // Overdue means the deadline has passed, not merely that it was raised.
      overdue: row.dueAt != null && row.dueAt.getTime() < now.getTime(),
      projectTitle: row.project?.title ?? null,
    }
  })
}

/**
 * Those that have not been announced yet.
 *
 * The bell keeps showing everything that is due until it is done; this is only
 * for the one-time alert, so a task does not re-announce itself every minute
 * the app is left open.
 */
export async function unannounced(userId: string, now: Date = new Date()): Promise<DueReminder[]> {
  const all = await dueReminders(userId, now)
  if (all.length === 0) return []

  const fresh = await prisma.task.findMany({
    where: { id: { in: all.map((r) => r.id) }, notifiedAt: null },
    select: { id: true },
  })
  const freshIds = new Set(fresh.map((row) => row.id))
  return all.filter((reminder) => freshIds.has(reminder.id))
}

export async function markAnnounced(userId: string, ids: string[], now: Date = new Date()) {
  if (ids.length === 0) return
  // Scoped by userId so an id from elsewhere stamps nothing.
  await prisma.task.updateMany({
    where: { id: { in: ids }, userId },
    data: { notifiedAt: now },
  })
}

/** The in-app channel: the bell reads the same query, so this is a no-op that
 *  documents the seam rather than pretending to send anything. */
export const inAppChannel: ReminderChannel = {
  name: "in-app",
  async deliver() {
    // Nothing to do: the client polls dueReminders() directly.
  },
}

/** Every channel a reminder goes out on. Email joins this list once a
 *  scheduled job exists to run it while the app is closed. */
export const channels: ReminderChannel[] = [inAppChannel]
