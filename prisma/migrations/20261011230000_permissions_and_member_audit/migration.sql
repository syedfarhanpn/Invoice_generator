-- Permissions, and a record of who changed whose access.
--
-- Two new tables. No existing table is altered, nothing is dropped, and no
-- column is added to anything you already have - so every row in the database
-- is untouched by this migration.
--
-- Background worth stating, because it is the reason this exists: MemberRole
-- has been in the schema since the workspace migration but enforced NOTHING.
-- It appeared in a dropdown. Any authenticated member of a workspace could
-- reach every module. These rows, plus the defaults in
-- src/lib/permissions.ts, are what finally make the role mean something, and
-- src/lib/access.ts is the server-side gate that reads them.
--
-- The CHECK at the bottom is the one to read closely: a grant belongs either
-- to a ROLE or to one MEMBERSHIP, never to both and never to neither.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'PermissionAccess' AND n.nspname = 'public') THEN
    CREATE TYPE public."PermissionAccess" AS ENUM ('NONE', 'READ', 'WRITE');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- PermissionGrant
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."PermissionGrant" (
  "id"           TEXT NOT NULL,
  "orgId"        TEXT NOT NULL,
  -- Exactly one of these two is set. See the CHECK below.
  "role"         public."MemberRole",
  "membershipId" TEXT,
  -- One of the module keys in src/lib/permissions.ts. Text rather than an
  -- enum: the module list grows with the product, and an unrecognised value
  -- grants nothing because the resolver only looks up modules it knows.
  "module"       TEXT NOT NULL,
  "access"       public."PermissionAccess" NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PermissionGrant_pkey" PRIMARY KEY ("id")
);

-- One grant per role per module, and one per person per module. Postgres
-- allows many NULLs under a unique index, so a table full of per-person
-- grants does not collide on the role-wide index, or the other way round.
CREATE UNIQUE INDEX IF NOT EXISTS "PermissionGrant_orgId_role_module_key"
  ON public."PermissionGrant" ("orgId", "role", "module");
CREATE UNIQUE INDEX IF NOT EXISTS "PermissionGrant_membershipId_module_key"
  ON public."PermissionGrant" ("membershipId", "module");
CREATE INDEX IF NOT EXISTS "PermissionGrant_orgId_idx"
  ON public."PermissionGrant" ("orgId");

-- ---------------------------------------------------------------------------
-- MemberAuditLog
--
-- Append-only. Nothing in the application deletes from here: if someone's
-- access was changed, that has to stay provable afterwards.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public."MemberAuditLog" (
  "id"        TEXT NOT NULL,
  "orgId"     TEXT NOT NULL,
  "actorId"   TEXT,
  "targetId"  TEXT,
  "action"    TEXT NOT NULL,
  -- Written when it happened rather than rebuilt later from ids that may
  -- since have been nulled, which would turn history into guesswork.
  "summary"   TEXT NOT NULL,
  "meta"      JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MemberAuditLog_orgId_createdAt_idx"
  ON public."MemberAuditLog" ("orgId", "createdAt");

-- ---------------------------------------------------------------------------
-- Foreign keys
--
-- Grants cascade with their workspace and with the membership they describe:
-- a permission for someone who is no longer a member is not worth keeping.
-- Audit rows do the opposite and SET NULL, so removing a membership never
-- erases the record of what they did.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PermissionGrant_orgId_fkey') THEN
    ALTER TABLE public."PermissionGrant" ADD CONSTRAINT "PermissionGrant_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PermissionGrant_membershipId_fkey') THEN
    ALTER TABLE public."PermissionGrant" ADD CONSTRAINT "PermissionGrant_membershipId_fkey"
      FOREIGN KEY ("membershipId") REFERENCES public."Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberAuditLog_orgId_fkey') THEN
    ALTER TABLE public."MemberAuditLog" ADD CONSTRAINT "MemberAuditLog_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberAuditLog_actorId_fkey') THEN
    ALTER TABLE public."MemberAuditLog" ADD CONSTRAINT "MemberAuditLog_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES public."Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberAuditLog_targetId_fkey') THEN
    ALTER TABLE public."MemberAuditLog" ADD CONSTRAINT "MemberAuditLog_targetId_fkey"
      FOREIGN KEY ("targetId") REFERENCES public."Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- The rule the application must not be able to break
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- A grant is for a role or for one person. Both would be ambiguous about
  -- which wins; neither would be a row nothing ever reads.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PermissionGrant_role_xor_membership') THEN
    ALTER TABLE public."PermissionGrant" ADD CONSTRAINT "PermissionGrant_role_xor_membership"
      CHECK (
        ("role" IS NOT NULL AND "membershipId" IS NULL) OR
        ("role" IS NULL     AND "membershipId" IS NOT NULL)
      );
  END IF;

  -- The owner's access is absolute in src/lib/permissions.ts; storing a grant
  -- that pretends otherwise would be a row that silently does nothing, and an
  -- operator would reasonably believe it had taken effect.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PermissionGrant_not_owner') THEN
    ALTER TABLE public."PermissionGrant" ADD CONSTRAINT "PermissionGrant_not_owner"
      CHECK ("role" IS NULL OR "role" <> 'OWNER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PermissionGrant_module_not_blank') THEN
    ALTER TABLE public."PermissionGrant" ADD CONSTRAINT "PermissionGrant_module_not_blank"
      CHECK (length(btrim("module")) > 0);
  END IF;
END
$$;
