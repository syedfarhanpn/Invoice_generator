/**
 * Removes everything scripts/seed-portal-test.mts created.
 *
 * Matches on the "PORTAL TEST" marker only, so it cannot touch a real client
 * even if run twice or run by mistake. Prints what it will delete and needs
 * --yes before it deletes anything.
 *
 *   npx tsx scripts/clean-portal-test.mts        (dry run)
 *   npx tsx scripts/clean-portal-test.mts --yes  (delete)
 */
import { readFileSync } from "node:fs"

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "")
}

const { default: prisma } = await import("@/lib/db")

const MARK = "PORTAL TEST"
const commit = process.argv.includes("--yes")

const clients = await prisma.client.findMany({
  where: { fullName: { startsWith: MARK } },
  select: { id: true, fullName: true, email: true },
})

if (clients.length === 0) {
  console.log("Nothing to clean - no PORTAL TEST client found.")
  await prisma.$disconnect()
  process.exit(0)
}

const ids = clients.map((c) => c.id)
const [projects, documents, subscriptions, tickets] = await Promise.all([
  prisma.project.count({ where: { clientId: { in: ids } } }),
  prisma.document.count({ where: { clientId: { in: ids } } }),
  prisma.subscription.count({ where: { clientId: { in: ids } } }),
  prisma.ticket.count({ where: { clientId: { in: ids } } }),
])

console.log("Would delete:")
for (const c of clients) console.log(`  client  ${c.fullName} <${c.email}>`)
console.log(`  projects ${projects}, documents ${documents}, renewals ${subscriptions}, tickets ${tickets}`)

if (!commit) {
  console.log("\nDry run. Re-run with --yes to delete.")
  await prisma.$disconnect()
  process.exit(0)
}

// Children first: every one of these has a foreign key onto Client.
await prisma.ticket.deleteMany({ where: { clientId: { in: ids } } })
await prisma.subscription.deleteMany({ where: { clientId: { in: ids } } })
await prisma.document.deleteMany({ where: { clientId: { in: ids } } })
await prisma.project.deleteMany({ where: { clientId: { in: ids } } })
await prisma.client.deleteMany({ where: { id: { in: ids } } })

console.log("\nDeleted. The Supabase auth account is left alone - remove it")
console.log("from the Supabase dashboard if you want it gone too.")

await prisma.$disconnect()
