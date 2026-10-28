-- Per-member record visibility, and an account owner on a client.
--
-- Three additive columns. Nothing is dropped or retyped, no existing row is
-- read or rewritten, and the defaults preserve today's behaviour exactly:
-- every member keeps seeing everything until someone restricts them, and
-- every client starts with no account owner.
--
-- Client.ownerId follows the pattern every other assignment uses - a
-- nullable Membership with ON DELETE SET NULL, so removing someone from the
-- team orphans their accounts rather than deleting them.

ALTER TABLE "public"."Membership" ADD COLUMN "phone" TEXT;

-- false, not true: a restriction nobody asked for is the dangerous default.
ALTER TABLE "public"."Membership"
  ADD COLUMN "restrictedToOwnRecords" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."Client" ADD COLUMN "ownerId" TEXT;

ALTER TABLE "public"."Client"
  ADD CONSTRAINT "Client_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "public"."Membership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Client_ownerId_idx" ON "public"."Client" ("ownerId");
