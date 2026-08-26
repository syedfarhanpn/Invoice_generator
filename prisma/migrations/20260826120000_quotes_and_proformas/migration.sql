-- Quotations + proforma invoices.
--
-- Purely additive: one new enum value, four new nullable/defaulted columns,
-- one self-referencing FK. No existing row is read, rewritten or dropped, so
-- this is safe to apply to live data. Re-runnable guards are used throughout
-- in case a partial run needs repeating.
--
-- NOTE ON THE ENUM: `ALTER TYPE ... ADD VALUE` is allowed inside a
-- transaction on PostgreSQL 12+ (which Supabase is), on the condition that
-- the new value is not *used* in that same transaction. Nothing below
-- references 'PROFORMA', so this commits cleanly under the BEGIN/COMMIT that
-- scripts/apply-migrations.mjs wraps each migration in.

-- ============================================================
-- DocumentType: add PROFORMA (QUOTE already exists from phase 2)
-- ============================================================
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PROFORMA';

-- ============================================================
-- Per-type serial counters on Client.
--
-- Quotes and proformas get their own counters so that converting one into an
-- invoice does not consume an invoice number, and each series (QUO-/PRO-/
-- INV-) stays gapless on its own. Defaulting to 0 matches a client that has
-- never issued one, which is true for every existing row.
-- ============================================================
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "quoteSeq"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "proformaSeq" INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Conversion lineage: the INVOICE created from an accepted QUOTE/PROFORMA
-- points back at its source. ON DELETE SET NULL so deleting a source draft
-- never cascades into a real issued invoice.
-- ============================================================
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "convertedFromId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Document_convertedFromId_fkey'
  ) THEN
    ALTER TABLE "Document"
      ADD CONSTRAINT "Document_convertedFromId_fkey"
      FOREIGN KEY ("convertedFromId") REFERENCES "Document"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Document_convertedFromId_idx" ON "Document"("convertedFromId");
