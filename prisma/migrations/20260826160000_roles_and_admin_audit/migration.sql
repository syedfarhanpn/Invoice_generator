-- Roles, account status, and an admin audit trail.
--
-- Additive. Existing rows get role=USER and status=ACTIVE by default; the
-- bootstrap super admin is promoted at first login by getCurrentUser() from
-- SUPER_ADMIN_EMAIL, so no row is rewritten here and there is no window in
-- which the wrong account holds SUPER_ADMIN.
--
-- IMPORTANT: this changes the meaning of SUPER_ADMIN_EMAIL. It stops being
-- the allowlist for *access* and becomes bootstrap only. Access is now
-- decided by User.status and provisioning (see ALLOW_SELF_SIGNUP in
-- .env.example). Keep Supabase's "Allow new users to sign up" OFF unless you
-- have deliberately opened self-service signup.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('USER', 'SUPER_ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountStatus') THEN
    CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role"        "Role"          NOT NULL DEFAULT 'USER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status"      "AccountStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_role_idx"   ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");

CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
  "id"           TEXT         NOT NULL,
  "actorId"      TEXT         NOT NULL,
  "targetUserId" TEXT,
  "action"       TEXT         NOT NULL,
  "meta"         JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx"             ON "AdminAuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorId_createdAt_idx"     ON "AdminAuditLog"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAuditLog_targetUserId_createdAt_idx" ON "AdminAuditLog"("targetUserId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminAuditLog_actorId_fkey') THEN
    ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminAuditLog_targetUserId_fkey') THEN
    ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_targetUserId_fkey"
      FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
