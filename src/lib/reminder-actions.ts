"use server"

import { getCurrentUser } from "@/lib/current-user"
import { dueReminders, markAnnounced, unannounced } from "@/lib/reminders"

/**
 * What the bell polls.
 *
 * Serialised to plain strings at the boundary: a Date crossing to the client
 * arrives as one thing on first render and another after hydration, and the
 * bell is not worth a hydration mismatch.
 */

export type ReminderView = {
  id: string
  title: string
  dueAtIso: string
  overdue: boolean
  projectTitle: string | null
}

export async function fetchReminders(): Promise<{
  due: ReminderView[]
  /** Those not yet announced, returned once and then stamped. */
  fresh: ReminderView[]
}> {
  const user = await getCurrentUser()
  const now = new Date()

  const [all, newOnes] = await Promise.all([
    dueReminders(user.id, now),
    unannounced(user.id, now),
  ])

  // Stamped as we hand them over: the caller is about to show them, and a
  // second poll must not raise the same alert again.
  await markAnnounced(user.id, newOnes.map((r) => r.id), now)

  const toView = (r: (typeof all)[number]): ReminderView => ({
    id: r.id,
    title: r.title,
    dueAtIso: r.dueAt.toISOString(),
    overdue: r.overdue,
    projectTitle: r.projectTitle,
  })

  return { due: all.map(toView), fresh: newOnes.map(toView) }
}
