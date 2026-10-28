-- Client portal accounts.
--
-- Additive only: three nullable columns and one partial unique index. No
-- existing row is read or changed, nothing is dropped or retyped, and every
-- client starts with no portal access (all three NULL) until invited.
--
-- portalUserId holds the client's Supabase auth uid. It is deliberately NOT
-- a foreign key to anything in this database: a portal user is not a
-- workspace User, and must never become one - getCurrentUser() is fail
-- closed, so an auth account with no User row cannot reach the dashboard.
--
-- The unique index is partial so the many NULLs do not collide, and so that
-- uniqueness means what it says: one auth account maps to at most one client.

ALTER TABLE "public"."Client" ADD COLUMN "portalUserId" TEXT;
ALTER TABLE "public"."Client" ADD COLUMN "portalInvitedAt" TIMESTAMP(3);
ALTER TABLE "public"."Client" ADD COLUMN "portalEnabledAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Client_portalUserId_key"
  ON "public"."Client" ("portalUserId")
  WHERE "portalUserId" IS NOT NULL;
