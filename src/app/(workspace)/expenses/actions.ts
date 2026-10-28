"use server"

import { revalidatePath } from "next/cache"
import type { ExpenseRecurrence, ExpenseScope, ExpenseStatus } from "@prisma/client"

import { assertPermission } from "@/lib/access"
import prisma from "@/lib/db"
import { getWorkspaceIdentity } from "@/lib/workspace-identity"
import { currentOrgId } from "@/lib/members"

/**
 * Writes for Expenses.
 *
 * The scope rule - PROJECT needs a project, OVERHEAD must not have one - is
 * enforced by a CHECK constraint in the database. It is also enforced here,
 * not as belt and braces but because the constraint can only reject; this can
 * explain. An operator who picks a project and then switches to Overhead
 * should get a sensible save, not a database error.
 */

const STATUSES: ExpenseStatus[] = ["PAID", "PENDING", "PARTIALLY_PAID", "OVERDUE"]
const RECURRENCES: ExpenseRecurrence[] = ["ONE_OFF", "MONTHLY", "QUARTERLY", "YEARLY"]

export type ExpenseInput = {
  id?: string
  title: string
  category: string
  amount: string
  spentOn: string
  vendor: string | null
  paymentMethod: string | null
  status: string
  scope: string
  projectId: string | null
  departmentId: string | null
  recurrence: string
  notes: string | null
}

/** IST, the same clock the rest of the app reads dates in. */
const OPERATOR_OFFSET = "+05:30"

function parseDay(value: string | null | undefined, fallback: Date): Date {
  if (!value?.trim()) return fallback
  const parsed = new Date(`${value.trim()}T09:00:00${OPERATOR_OFFSET}`)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function parseAmount(value: string): number {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""))
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("An expense needs an amount of zero or more.")
  }
  return parsed
}

/**
 * The next date a recurring cost falls due, from the date it was last paid.
 * Null for a one-off, which is what keeps the renewals view honest.
 */
function nextDue(spentOn: Date, recurrence: ExpenseRecurrence): Date | null {
  if (recurrence === "ONE_OFF") return null
  const next = new Date(spentOn)
  const months = recurrence === "MONTHLY" ? 1 : recurrence === "QUARTERLY" ? 3 : 12
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

/** Resolves scope and project together, so the pair can never contradict. */
async function resolveScope(
  userId: string,
  scope: string,
  projectId: string | null
): Promise<{ scope: ExpenseScope; projectId: string | null }> {
  if (scope !== "PROJECT") return { scope: "OVERHEAD", projectId: null }

  if (!projectId) {
    throw new Error("Pick the project this cost belongs to, or mark it as company overhead.")
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, archivedAt: null },
    select: { id: true },
  })
  if (!project) throw new Error("That project no longer exists.")
  return { scope: "PROJECT", projectId: project.id }
}

async function resolveDepartment(userId: string, departmentId: string | null) {
  if (!departmentId) return null
  const department = await prisma.department.findFirst({
    where: { id: departmentId, org: { members: { some: { userId } } } },
    select: { id: true },
  })
  if (!department) throw new Error("That department is not in this workspace.")
  return department.id
}

export async function saveExpense(input: ExpenseInput) {
  await assertPermission("expenses", "write")
  const { workspaceId } = await getWorkspaceIdentity()

  const title = input.title.trim()
  if (!title) throw new Error("An expense needs a title.")
  const category = input.category.trim()
  if (!category) throw new Error("An expense needs a category.")

  const amount = parseAmount(input.amount)
  const spentOn = parseDay(input.spentOn, new Date())
  const recurrence = RECURRENCES.includes(input.recurrence as ExpenseRecurrence)
    ? (input.recurrence as ExpenseRecurrence)
    : "ONE_OFF"
  const status = STATUSES.includes(input.status as ExpenseStatus)
    ? (input.status as ExpenseStatus)
    : "PAID"

  const { scope, projectId } = await resolveScope(workspaceId, input.scope, input.projectId)
  const departmentId = await resolveDepartment(workspaceId, input.departmentId)

  const profile = await prisma.businessProfile.findUnique({
    where: { userId: workspaceId },
    select: { currency: true },
  })

  const data = {
    title,
    category,
    amount,
    currency: profile?.currency || "INR",
    spentOn,
    vendor: input.vendor?.trim() || null,
    paymentMethod: input.paymentMethod?.trim() || null,
    status,
    scope,
    projectId,
    departmentId,
    recurrence,
    nextDueOn: nextDue(spentOn, recurrence),
    notes: input.notes?.trim() || null,
  }

  if (input.id) {
    // Scoped by userId so an id from elsewhere updates nothing.
    const existing = await prisma.expense.findFirst({
      where: { id: input.id, userId: workspaceId, archivedAt: null },
      select: { id: true },
    })
    if (!existing) throw new Error("That expense no longer exists.")
    await prisma.expense.update({ where: { id: input.id }, data })
  } else {
    await prisma.expense.create({
      data: { ...data, userId: workspaceId, orgId: await currentOrgId(workspaceId) },
    })
  }

  revalidatePath("/expenses")
  revalidatePath("/dashboard")
}

export async function archiveExpense(expenseId: string) {
  await assertPermission("expenses", "write")
  const { workspaceId } = await getWorkspaceIdentity()
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId: workspaceId, archivedAt: null },
    select: { id: true },
  })
  if (!expense) throw new Error("That expense no longer exists.")

  // Archived, not deleted: last year's costs are what this year is judged
  // against, and a removed row would quietly change a closed period.
  await prisma.expense.update({
    where: { id: expenseId },
    data: { archivedAt: new Date() },
  })

  revalidatePath("/expenses")
  revalidatePath("/dashboard")
}
