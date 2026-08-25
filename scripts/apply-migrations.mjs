/**
 * Applies pending Prisma migrations over a plain `pg` connection.
 *
 * `prisma migrate deploy` hangs indefinitely against Supabase's connection
 * pooler (its migration engine waits on an advisory lock that never resolves),
 * so this applies each pending migration itself and records it in
 * `_prisma_migrations` exactly as the CLI would. Prisma's own tooling stays
 * happy: `migrate status` and future `migrate deploy` runs read this history.
 *
 * Safe to re-run - already-applied migrations are skipped, and each migration
 * runs in its own transaction, so a failure rolls back cleanly.
 *
 * Usage: node scripts/apply-migrations.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import pg from 'pg'

const MIGRATIONS_DIR = path.join('prisma', 'migrations')

function readEnvVar(key) {
  const envText = fs.readFileSync('.env', 'utf8')
  const match = envText.match(new RegExp(`^${key}="(.*)"$`, 'm'))
  return match ? match[1] : process.env[key]
}

// Migrations must bypass the transaction-mode pooler, same as prisma.config.ts.
const connectionString = readEnvVar('DIRECT_URL')
if (!connectionString) {
  console.error('DIRECT_URL is not set in .env')
  process.exit(1)
}

const migrations = fs
  .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 20000 })
await client.connect()

await client.query(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"            VARCHAR(64) NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  )
`)

const { rows: appliedRows } = await client.query(
  'SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL'
)
const applied = new Set(appliedRows.map((r) => r.migration_name))

let appliedCount = 0
try {
  for (const name of migrations) {
    if (applied.has(name)) {
      console.log(`skip    ${name} (already applied)`)
      continue
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'))
    const checksum = crypto.createHash('sha256').update(sql).digest('hex')

    process.stdout.write(`apply   ${name} ... `)
    try {
      await client.query('BEGIN')
      await client.query(sql.toString('utf8'))
      await client.query(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), now(), 1)`,
        [crypto.randomUUID(), checksum, name]
      )
      await client.query('COMMIT')
      console.log('ok')
      appliedCount++
    } catch (err) {
      await client.query('ROLLBACK')
      console.log('FAILED (rolled back)')
      throw err
    }
  }
  console.log(
    appliedCount === 0
      ? '\nDatabase already up to date.'
      : `\nApplied ${appliedCount} migration(s).`
  )
} catch (err) {
  console.error('\n' + err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
