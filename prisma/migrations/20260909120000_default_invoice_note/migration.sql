-- Per-user default note, pre-filled into new invoices, quotes and proformas.
-- Additive and nullable: existing profiles keep no default, which reproduces
-- today's behaviour of starting with an empty Notes field.

ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "defaultInvoiceNote" TEXT;
