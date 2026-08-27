-- Advance / prior-milestone amount carried onto an invoice.
--
-- Additive with a zero default, so every existing document keeps exactly the
-- totals it has today: an advanceReceived of 0 deducts nothing and the
-- balance due equals the total, which is the current behaviour.

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "advanceReceived" DECIMAL(12,2) NOT NULL DEFAULT 0;
