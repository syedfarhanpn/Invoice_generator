-- Phase 2 schema migration for the demo build.
--
-- IMPORTANT: this file was hand-written against prisma/schema.prisma without
-- a live database connection (this session has no credentials for your
-- Supabase instance). It has NOT been run against real data. Before running
-- `npm run db:migrate` against anything you care about, run it against a
-- throwaway copy of the database first, or take a backup / Supabase branch.
-- It is written to be safe against the current seed-data-only state
-- (INVOICE and CLIENT_AGREEMENT documents only, a handful of clients) - see
-- the comments below for the one assumption that would make it fail loudly
-- instead of silently corrupting data.

-- ============================================================
-- TaxMode enum (new)
-- ============================================================
CREATE TYPE "TaxMode" AS ENUM ('NONE', 'PERCENTAGE');

-- ============================================================
-- DocumentType enum: trim from 12 document types down to the 3 this build
-- ships (INVOICE, CONTRACT, QUOTE). CLIENT_AGREEMENT is renamed to CONTRACT.
--
-- ASSUMPTION: no Document row uses any of the other 9 legacy types
-- (WELCOME_DOC, DISCOVERY_CALL, PROJECT_BRIEF, TASK_LIST, DELIVERY_GUIDE,
-- MONTHLY_REPORT, THANK_YOU_DOC, FEEDBACK_REQUEST, PACKAGE_MENU,
-- BROLL_CHECKLIST) - true as of this build, since no editor for them was
-- ever implemented. The USING cast below will fail the whole migration
-- (rolled back by apply-migrations.mjs) if that assumption is wrong, rather
-- than silently dropping rows.
-- ============================================================
CREATE TYPE "DocumentType_new" AS ENUM ('INVOICE', 'CONTRACT', 'QUOTE');

ALTER TABLE "Document"
  ALTER COLUMN "type" TYPE "DocumentType_new"
  USING (
    CASE "type"::text
      WHEN 'CLIENT_AGREEMENT' THEN 'CONTRACT'
      ELSE "type"::text
    END
  )::"DocumentType_new";

DROP TYPE "DocumentType";
ALTER TYPE "DocumentType_new" RENAME TO "DocumentType";

-- ============================================================
-- DocumentStatus enum: money state (paid/partial/overdue) moves to being
-- derived from Document.amountPaid vs totalAmount/dueDate (see
-- src/lib/money.ts) instead of stored here, so it can't drift out of sync
-- with the Payment ledger. SENT/VIEWED/PAID/OVERDUE all collapse into
-- FINALIZED; SIGNED and DRAFT/ARCHIVED carry over; VOID is new.
-- ============================================================
CREATE TYPE "DocumentStatus_new" AS ENUM ('DRAFT', 'FINALIZED', 'SIGNED', 'VOID', 'ARCHIVED');

ALTER TABLE "Document" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Document"
  ALTER COLUMN "status" TYPE "DocumentStatus_new"
  USING (
    CASE "status"::text
      WHEN 'SENT' THEN 'FINALIZED'
      WHEN 'VIEWED' THEN 'FINALIZED'
      WHEN 'PAID' THEN 'FINALIZED'
      WHEN 'OVERDUE' THEN 'FINALIZED'
      ELSE "status"::text
    END
  )::"DocumentStatus_new";

ALTER TABLE "Document" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "DocumentStatus";
ALTER TYPE "DocumentStatus_new" RENAME TO "DocumentStatus";

-- ============================================================
-- User: backs Client.clientNumber allocation
-- ============================================================
ALTER TABLE "User" ADD COLUMN "clientSeq" INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- BusinessProfile: tax/payment-term defaults, UPI id, counter-signature
-- ============================================================
ALTER TABLE "BusinessProfile" ADD COLUMN "upiId" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "defaultTaxMode" "TaxMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "BusinessProfile" ADD COLUMN "defaultTaxRate" DECIMAL(5,2);
ALTER TABLE "BusinessProfile" ADD COLUMN "defaultTaxLabel" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "defaultPaymentTermDays" INTEGER DEFAULT 15;
ALTER TABLE "BusinessProfile" ADD COLUMN "signatureName" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "signatureImageUrl" TEXT;

-- ============================================================
-- Client: code + clientNumber + per-client serial counters
-- ============================================================
ALTER TABLE "Client" ADD COLUMN "clientNumber" INTEGER;
ALTER TABLE "Client" ADD COLUMN "code" TEXT;
ALTER TABLE "Client" ADD COLUMN "taxId" TEXT;
ALTER TABLE "Client" ADD COLUMN "defaultCurrency" TEXT;
ALTER TABLE "Client" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "invoiceSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Client" ADD COLUMN "contractSeq" INTEGER NOT NULL DEFAULT 0;

-- Backfill clientNumber for any clients that predate this migration (e.g.
-- from the old seed script), ordered by creation date for a stable result.
WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt") AS rn
  FROM "Client"
)
UPDATE "Client" c
SET "clientNumber" = numbered.rn
FROM numbered
WHERE c."id" = numbered."id" AND c."clientNumber" IS NULL;

-- Derive a starting code from businessName (falling back to fullName) for
-- existing rows. New clients created after this migration get their code
-- from the app instead (src/lib/client-code.ts); this only backfills
-- pre-existing rows so the NOT NULL + unique constraints below can be added.
UPDATE "Client"
SET "code" = UPPER(LEFT(REGEXP_REPLACE(COALESCE(NULLIF("businessName", ''), "fullName"), '[^a-zA-Z0-9]', '', 'g'), 4))
WHERE "code" IS NULL;

-- Resolve any collisions the backfill above created (e.g. two clients both
-- reducing to "ACME") by appending clientNumber to the later duplicates.
UPDATE "Client" c
SET "code" = c."code" || c."clientNumber"::text
WHERE EXISTS (
  SELECT 1 FROM "Client" c2
  WHERE c2."userId" = c."userId"
    AND c2."code" = c."code"
    AND c2."id" <> c."id"
    AND c2."clientNumber" < c."clientNumber"
);

ALTER TABLE "Client" ALTER COLUMN "clientNumber" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX "Client_userId_code_key" ON "Client"("userId", "code");
CREATE INDEX "Client_userId_archivedAt_idx" ON "Client"("userId", "archivedAt");

-- Continue clientNumber allocation from the highest backfilled value.
UPDATE "User" u
SET "clientSeq" = COALESCE((SELECT MAX(c."clientNumber") FROM "Client" c WHERE c."userId" = u."id"), 0);

-- ============================================================
-- Document: numbering becomes finalize-time, tax fields, payment ledger
-- total, snapshot integrity hash. pdfUrl is dropped - PDFs are print-to-PDF
-- from the share page now (src/app/share/[publicSlug]/page.tsx), nothing
-- writes pdfUrl anymore.
-- ============================================================
ALTER TABLE "Document" DROP COLUMN "pdfUrl";

ALTER TABLE "Document" ALTER COLUMN "refNumber" DROP NOT NULL;
ALTER TABLE "Document" ADD COLUMN "sequence" INTEGER;

UPDATE "Document" SET "currency" = 'USD' WHERE "currency" IS NULL;
ALTER TABLE "Document" ALTER COLUMN "currency" SET NOT NULL;
ALTER TABLE "Document" ALTER COLUMN "currency" SET DEFAULT 'USD';

ALTER TABLE "Document" ADD COLUMN "taxMode" "TaxMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Document" ADD COLUMN "taxRate" DECIMAL(5,2);
ALTER TABLE "Document" ADD COLUMN "taxLabel" TEXT;
ALTER TABLE "Document" ADD COLUMN "subtotal" DECIMAL(12,2);
ALTER TABLE "Document" ADD COLUMN "taxAmount" DECIMAL(12,2);
ALTER TABLE "Document" ADD COLUMN "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Document" ADD COLUMN "finalizedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "slugRevokedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "contentHash" TEXT;

-- Widen from Decimal(10,2) - ten total digits caps out around 99,999,999.99,
-- tight for INR totals.
ALTER TABLE "Document" ALTER COLUMN "totalAmount" TYPE DECIMAL(12,2);

CREATE UNIQUE INDEX "Document_userId_refNumber_key" ON "Document"("userId", "refNumber");
CREATE INDEX "Document_userId_status_idx" ON "Document"("userId", "status");

-- ============================================================
-- Payment: append-only ledger backing derived paid/partial/overdue status
-- ============================================================
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payment_documentId_idx" ON "Payment"("documentId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- DocumentActivity: index to make the client-timeline query fast
-- ============================================================
CREATE INDEX "DocumentActivity_documentId_createdAt_idx" ON "DocumentActivity"("documentId", "createdAt");
