-- Public REST API: per-tenant API keys, idempotency records, external IDs.
--
-- Fully additive. The externalId columns are nullable and their unique indexes
-- are composite with userId; Postgres permits many NULLs under a unique index,
-- so every existing hand-created client and document is unaffected.

ALTER TABLE "Client"   ADD COLUMN IF NOT EXISTS "externalId"   TEXT;
ALTER TABLE "Client"   ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "externalId"   TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_userId_externalId_key"   ON "Client"("userId", "externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "Document_userId_externalId_key" ON "Document"("userId", "externalId");

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id"         TEXT         NOT NULL,
  "userId"     TEXT         NOT NULL,
  "name"       TEXT         NOT NULL,
  "lookupId"   TEXT         NOT NULL,
  "keyHash"    TEXT         NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_lookupId_key"      ON "ApiKey"("lookupId");
CREATE INDEX        IF NOT EXISTS "ApiKey_userId_revokedAt_idx" ON "ApiKey"("userId", "revokedAt");

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
  "id"             TEXT         NOT NULL,
  "userId"         TEXT         NOT NULL,
  "key"            TEXT         NOT NULL,
  "endpoint"       TEXT         NOT NULL,
  "requestHash"    TEXT         NOT NULL,
  "responseStatus" INTEGER      NOT NULL,
  "responseBody"   JSONB        NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyRecord_userId_key_key" ON "IdempotencyRecord"("userId", "key");
CREATE INDEX        IF NOT EXISTS "IdempotencyRecord_createdAt_idx"  ON "IdempotencyRecord"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ApiKey_userId_fkey') THEN
    ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IdempotencyRecord_userId_fkey') THEN
    ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
