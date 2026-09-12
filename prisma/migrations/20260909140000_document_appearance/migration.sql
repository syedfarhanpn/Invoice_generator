-- Per-user document appearance: the paper colour a document prints on and
-- the typeface it is set in. Defaults reproduce the previous hard-coded look
-- exactly (white paper, serif), so existing documents are unchanged.
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "paperColor" TEXT DEFAULT '#ffffff';
ALTER TABLE "BusinessProfile" ADD COLUMN IF NOT EXISTS "documentFont" TEXT DEFAULT 'serif';
