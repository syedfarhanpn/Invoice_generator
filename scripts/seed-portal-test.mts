/**
 * Creates one clearly-labelled test client with enough data to exercise the
 * portal, then sends it a portal invitation.
 *
 * Everything it makes is named "PORTAL TEST" so it is obvious in the
 * dashboard and trivial to remove afterwards - see scripts/clean-portal-test.ts.
 *
 * The invite goes to a +alias of the operator's own address, which Gmail
 * delivers to their existing inbox. That way the real email path is tested
 * and no password is ever written down or passed around.
 *
 *   npx tsx scripts/seed-portal-test.ts <your-email@example.com>
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "")
}

const { default: prisma } = await import("@/lib/db")
const { sendPortalInvite } = await import("@/lib/invites")

const MARK = "PORTAL TEST"

const inboxAddress = process.argv[2]
if (!inboxAddress?.includes("@")) {
  console.error("Pass the address the invite should go to, e.g.")
  console.error("  npx tsx scripts/seed-portal-test.ts you+portaltest@gmail.com")
  process.exit(1)
}

// The workspace owner: whoever the super admin address belongs to.
const ownerEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim()
const owner = await prisma.user.findFirst({
  where: ownerEmail ? { email: ownerEmail } : {},
  orderBy: { createdAt: "asc" },
  select: { id: true, email: true },
})
if (!owner) throw new Error("No workspace user found.")
console.log(`Workspace: ${owner.email}`)

const existing = await prisma.client.findFirst({
  where: { userId: owner.id, fullName: { startsWith: MARK } },
  select: { id: true },
})

const clientId =
  existing?.id ??
  (await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ seq: number }[]>(
      `SELECT "clientSeq" AS seq FROM "User" WHERE "id" = $1 FOR UPDATE`,
      owner.id
    )
    const next = (rows[0]?.seq ?? 0) + 1
    await tx.$executeRawUnsafe(`UPDATE "User" SET "clientSeq" = $1 WHERE "id" = $2`, next, owner.id)

    const created = await tx.client.create({
      data: {
        userId: owner.id,
        clientNumber: next,
        code: "PTEST",
        fullName: `${MARK} - delete me`,
        businessName: `${MARK} Ltd`,
        email: inboxAddress,
        phone: "+91 90000 00000",
        tags: ["test"],
      },
      select: { id: true },
    })
    return created.id
  }))

console.log(existing ? "Reusing the existing test client." : "Created the test client.")

// --- data for each portal panel, so none of them render empty -------------
const board = await prisma.pipeline.findFirst({
  where: { userId: owner.id, kind: "PROJECTS", archivedAt: null },
  include: { stages: { orderBy: { position: "asc" } } },
})
if (!board) throw new Error("No projects board found.")

const inFlight = board.stages.find((s) => s.type === "OPEN") ?? board.stages[0]
const now = new Date()
const inDays = (n: number) => new Date(now.getTime() + n * 86_400_000)

const haveProject = await prisma.project.findFirst({
  where: { clientId, title: { startsWith: MARK } },
  select: { id: true },
})
if (!haveProject) {
  await prisma.project.create({
    data: {
      userId: owner.id,
      pipelineId: board.id,
      stageId: inFlight.id,
      clientId,
      title: `${MARK} - Website build`,
      category: "Web Application",
      progress: 60,
      value: 85000,
      currency: "INR",
      startedAt: inDays(-40),
      deadline: inDays(14),
      description: "INTERNAL ONLY - this line must never appear in the portal.",
      position: 999,
    },
  })
  console.log("Added a project (60% done, due in 14 days).")
}

const haveInvoice = await prisma.document.findFirst({
  where: { clientId, title: { startsWith: MARK } },
  select: { id: true },
})
if (!haveInvoice) {
  await prisma.document.create({
    data: {
      userId: owner.id,
      clientId,
      type: "INVOICE",
      status: "FINALIZED",
      refNumber: "INV-PTEST-001",
      title: `${MARK} - Phase one`,
      content: {},
      currency: "INR",
      subtotal: 50000,
      totalAmount: 50000,
      amountPaid: 20000,
      issueDate: inDays(-20),
      dueDate: inDays(-2), // already past, so the portal shows a real status
    },
  })
  console.log("Added an invoice (part paid, past due).")
}

const haveRenewal = await prisma.subscription.findFirst({
  where: { clientId, name: { startsWith: MARK } },
  select: { id: true },
})
if (!haveRenewal) {
  await prisma.subscription.create({
    data: {
      userId: owner.id,
      clientId,
      kind: "DOMAIN",
      name: `${MARK.toLowerCase().replace(/\s/g, "")}.example`,
      startsOn: inDays(-340),
      renewsOn: inDays(25),
      cycle: "YEARLY",
      cost: 900, // must NOT reach the portal
      price: 1499, // this one should
      currency: "INR",
      status: "ACTIVE",
      autoRenew: false,
    },
  })
  console.log("Added a domain renewal (cost 900 hidden, price 1499 shown).")
}

const haveTicket = await prisma.ticket.findFirst({
  where: { clientId, subject: { startsWith: MARK } },
  select: { id: true },
})
if (!haveTicket) {
  const seq = await prisma.user.update({
    where: { id: owner.id },
    data: { ticketSeq: { increment: 1 } },
    select: { ticketSeq: true },
  })
  await prisma.ticket.create({
    data: {
      id: randomUUID(),
      userId: owner.id,
      clientId,
      number: seq.ticketSeq,
      subject: `${MARK} - Contact form not sending`,
      body: "INTERNAL ONLY - this body must never appear in the portal.",
      status: "IN_PROGRESS",
      priority: "HIGH",
      createdAt: inDays(-3),
      updatedAt: now,
    },
  })
  console.log("Added a support ticket (in progress).")
}

// --- the invitation --------------------------------------------------------
const profile = await prisma.businessProfile.findUnique({
  where: { userId: owner.id },
  select: { businessName: true },
})

const outcome = await sendPortalInvite({
  email: inboxAddress,
  clientName: `${MARK} Ltd`,
  note: "This is a test of the client portal.",
  brandName: profile?.businessName?.trim() || "Pixie Webs",
  inviterName: null,
  replyTo: owner.email,
})

await prisma.client.update({
  where: { id: clientId },
  data: { portalInvitedAt: new Date() },
})

console.log("")
if (outcome.emailed) {
  console.log(`Invitation EMAILED to ${inboxAddress}. Check that inbox.`)
} else {
  console.log(`Email not sent: ${outcome.problem}`)
  if (outcome.actionUrl) console.log(`\nOne-time sign-in link:\n${outcome.actionUrl}`)
}

await prisma.$disconnect()
