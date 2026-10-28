/**
 * Adds one employee to the workspace and invites them.
 *
 * Does exactly what Team Management's "Invite someone" does - a User row as
 * the invitation, a Membership carrying the role, and a branded email with a
 * link to set a password. Written as a script only because it is being run
 * on the operator's behalf rather than from their browser.
 *
 *   npx tsx scripts/add-employee.mts "Name" email@example.com SALES_EXECUTIVE "Job title"
 */
import { readFileSync } from "node:fs"

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "")
}

const { default: prisma } = await import("@/lib/db")
const { sendWorkspaceInvite } = await import("@/lib/invites")

const [name, email, role, title] = process.argv.slice(2)
if (!name || !email?.includes("@") || !role) {
  console.error('Usage: npx tsx scripts/add-employee.mts "Name" email ROLE "Title"')
  process.exit(1)
}

const address = email.trim().toLowerCase()

const ownerEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim()
const owner = await prisma.user.findFirst({
  where: ownerEmail ? { email: ownerEmail } : {},
  orderBy: { createdAt: "asc" },
  select: { id: true, email: true },
})
if (!owner) throw new Error("No workspace user found.")

const membership = await prisma.membership.findFirst({
  where: { userId: owner.id, status: { in: ["ACTIVE", "INVITED"] } },
  select: { orgId: true },
})
if (!membership?.orgId) throw new Error("The owner belongs to no workspace.")
const orgId = membership.orgId

const profile = await prisma.businessProfile.findUnique({
  where: { userId: owner.id },
  select: { businessName: true, ownerName: true },
})

const result = await prisma.$transaction(async (tx) => {
  // The User row IS the invitation - getCurrentUser() finds people by email,
  // so this is what connects them to the workspace when they sign in.
  const user = await tx.user.upsert({
    where: { email: address },
    update: { name },
    create: { email: address, name, role: "USER" },
    select: { id: true },
  })

  const already = await tx.membership.findFirst({
    where: { orgId, userId: user.id },
    select: { id: true, role: true, status: true },
  })
  if (already) return { created: false, membershipId: already.id }

  const created = await tx.membership.create({
    data: {
      orgId,
      userId: user.id,
      role: role as never,
      status: "INVITED",
      title: title || null,
      invitedAt: new Date(),
    },
    select: { id: true },
  })
  return { created: true, membershipId: created.id }
})

console.log(
  result.created
    ? `Added ${name} <${address}> as ${role}.`
    : `${name} <${address}> is already in this workspace - sending the invitation again.`
)

const outcome = await sendWorkspaceInvite({
  email: address,
  role: role as never,
  title: title || null,
  note: null,
  brandName: profile?.businessName?.trim() || "Pixie Webs",
  inviterName: profile?.ownerName?.trim() || null,
  replyTo: owner.email,
})

console.log("")
if (outcome.emailed) {
  console.log(`Invitation EMAILED to ${address}.`)
} else {
  console.log(`Email not sent: ${outcome.problem}`)
  if (outcome.actionUrl) console.log(`\nOne-time sign-in link:\n${outcome.actionUrl}`)
}

await prisma.$disconnect()
