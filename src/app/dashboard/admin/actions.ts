"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import type { Prisma, Role } from "@prisma/client"

import prisma from "@/lib/db"
import { requireSuperAdmin } from "@/lib/current-user"
import { canChangeRole, canRestore, canSuspend, type AdminTarget } from "@/lib/admin-guards"

// ---------------------------------------------------------------------------
// Account administration.
//
// Every action here: requires SUPER_ADMIN, re-reads the target inside a
// transaction (never trusts what the page rendered), runs the pure guard from
// admin-guards.ts, writes, and records an audit row in the SAME transaction -
// so an account change can never exist without the record of who made it.
//
// Note what is deliberately absent: nothing here reads a tenant's clients,
// documents or invoice contents. A super admin administers accounts; they are
// not given a back door into customer data.
// ---------------------------------------------------------------------------

const userIdSchema = z.string().min(1).max(64)
const roleSchema = z.enum(["USER", "SUPER_ADMIN"])
const emailSchema = z.string().trim().toLowerCase().email().max(320)

function bootstrapAdminEmail(): string | null {
  return process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim() || null
}

const TARGET_SELECT = { id: true, email: true, role: true, status: true } as const

function toTarget(row: { id: string; email: string; role: Role; status: AdminTarget["status"] }): AdminTarget {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    isBootstrapAdmin: row.email.toLowerCase().trim() === bootstrapAdminEmail(),
  }
}

/**
 * Post-condition assert, run inside the transaction after the write. The
 * pre-flight guard gives a good error message, but its count can go stale
 * under READ COMMITTED; this cannot, because the UPDATE has already taken its
 * row locks. Throwing here rolls the whole transaction back.
 */
async function assertSuperAdminRemains(tx: Prisma.TransactionClient) {
  const remaining = await tx.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } })
  if (remaining < 1) {
    throw new Error("That change would leave the product with no active super admin.")
  }
}

function revalidateAdmin() {
  revalidatePath("/dashboard/admin")
}

// ---------------------------------------------------------------------------
// Provisioning - fail-closed access is granted here, one account at a time.
// ---------------------------------------------------------------------------
export async function provisionUser(rawEmail: string) {
  const actor = await requireSuperAdmin()
  const parsed = emailSchema.safeParse(rawEmail)
  if (!parsed.success) throw new Error("Enter a valid email address.")
  const email = parsed.data

  await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new Error("An account already exists for that email address.")

    const created = await tx.user.create({ data: { email, role: "USER", status: "ACTIVE" } })
    await tx.adminAuditLog.create({
      data: { actorId: actor.id, targetUserId: created.id, action: "user.provisioned", meta: { email } },
    })
  })

  revalidateAdmin()
}

// ---------------------------------------------------------------------------
// Suspend / restore
// ---------------------------------------------------------------------------
export async function suspendUser(rawId: string) {
  const actor = await requireSuperAdmin()
  const id = userIdSchema.parse(rawId)

  await prisma.$transaction(async (tx) => {
    const row = await tx.user.findUnique({ where: { id }, select: TARGET_SELECT })
    if (!row) throw new Error("Account not found.")

    const guard = canSuspend(actor, toTarget(row))
    if (!guard.ok) throw new Error(guard.reason)

    await tx.user.update({
      where: { id },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    })
    await tx.adminAuditLog.create({
      data: { actorId: actor.id, targetUserId: id, action: "user.suspended", meta: { email: row.email } },
    })
    await assertSuperAdminRemains(tx)
  })

  revalidateAdmin()
}

export async function restoreUser(rawId: string) {
  const actor = await requireSuperAdmin()
  const id = userIdSchema.parse(rawId)

  await prisma.$transaction(async (tx) => {
    const row = await tx.user.findUnique({ where: { id }, select: TARGET_SELECT })
    if (!row) throw new Error("Account not found.")

    const guard = canRestore(actor, toTarget(row))
    if (!guard.ok) throw new Error(guard.reason)

    await tx.user.update({ where: { id }, data: { status: "ACTIVE", suspendedAt: null } })
    await tx.adminAuditLog.create({
      data: { actorId: actor.id, targetUserId: id, action: "user.restored", meta: { email: row.email } },
    })
  })

  revalidateAdmin()
}

// ---------------------------------------------------------------------------
// Role changes
// ---------------------------------------------------------------------------
export async function changeUserRole(rawId: string, rawRole: string) {
  const actor = await requireSuperAdmin()
  const id = userIdSchema.parse(rawId)
  const newRole = roleSchema.parse(rawRole)

  await prisma.$transaction(async (tx) => {
    const row = await tx.user.findUnique({ where: { id }, select: TARGET_SELECT })
    if (!row) throw new Error("Account not found.")

    // Counted inside the transaction so the guard sees a consistent number.
    const activeSuperAdmins = await tx.user.count({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" },
    })

    const guard = canChangeRole(actor, toTarget(row), newRole, activeSuperAdmins)
    if (!guard.ok) throw new Error(guard.reason)

    await tx.user.update({ where: { id }, data: { role: newRole } })
    await tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        targetUserId: id,
        action: "user.role_changed",
        meta: { email: row.email, from: row.role, to: newRole },
      },
    })
    await assertSuperAdminRemains(tx)
  })

  revalidateAdmin()
}
