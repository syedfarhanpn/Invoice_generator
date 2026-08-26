-- Composite indexes for the dashboard list queries.
--
-- Both list pages run `WHERE "userId" = $1 ORDER BY "createdAt" DESC`. The
-- existing indexes ([userId, type], [userId, status], [userId, archivedAt])
-- can serve the filter but not the sort, so Postgres falls back to sorting
-- the whole filtered set. These make it an index scan.
--
-- Additive and re-runnable. Written WITHOUT CONCURRENTLY because
-- scripts/apply-migrations.mjs wraps each migration in a transaction and
-- CREATE INDEX CONCURRENTLY cannot run inside one. That is the right
-- trade-off at current table sizes (a brief write lock on a tiny table); if
-- these tables ever grow large, build the index concurrently out-of-band
-- instead of through this runner.

CREATE INDEX IF NOT EXISTS "Document_userId_createdAt_idx" ON "Document"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Client_userId_createdAt_idx"   ON "Client"("userId", "createdAt");
