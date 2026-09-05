-- Numbered receipts for recorded payments.
--
-- Payment.userId is denormalised from its parent Document so a receipt number
-- can carry the same @@unique([userId, ...]) backstop the document serials
-- have. Backfilled from the existing relation before being made NOT NULL, so
-- no row is left dangling.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "receiptSeq" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "receiptNumber" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "sequence"      INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "userId"        TEXT;

-- Every payment already belongs to exactly one document, which belongs to one
-- user, so this cannot leave NULLs behind.
UPDATE "Payment" p
   SET "userId" = d."userId"
  FROM "Document" d
 WHERE d."id" = p."documentId"
   AND p."userId" IS NULL;

-- Fail loudly rather than silently continuing if the assumption above is wrong.
DO $$
DECLARE orphaned INTEGER;
BEGIN
  SELECT count(*) INTO orphaned FROM "Payment" WHERE "userId" IS NULL;
  IF orphaned > 0 THEN
    RAISE EXCEPTION 'Cannot backfill Payment.userId: % payment(s) have no parent document', orphaned;
  END IF;
END $$;

ALTER TABLE "Payment" ALTER COLUMN "userId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_userId_fkey') THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_userId_receiptNumber_key" ON "Payment"("userId", "receiptNumber");
CREATE INDEX        IF NOT EXISTS "Payment_userId_paidOn_idx"        ON "Payment"("userId", "paidOn");
