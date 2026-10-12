-- Turns one-workspace-per-user into a shared company workspace.
--
-- Additive and backward compatible. `userId` stays on every row as the record
-- of who created it; `orgId` is added alongside it, nullable, and backfilled.
-- Nothing is dropped and no existing query breaks - the app keeps reading
-- userId until each module's stage switches it over.
--
-- Guarded throughout so a re-run is a no-op, and the backfill REFUSES rather
-- than merging two businesses into one workspace. See the exception below.

-- 1. Roles. ------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'MemberRole' AND n.nspname = 'public') THEN
    CREATE TYPE public."MemberRole" AS ENUM (
      'OWNER','ADMIN','PROJECT_MANAGER','SALES_EXECUTIVE',
      'DEVELOPER','SUPPORT_EXECUTIVE','ACCOUNTANT','CONTENT_CREATOR');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'MemberStatus' AND n.nspname = 'public') THEN
    CREATE TYPE public."MemberStatus" AS ENUM ('INVITED','ACTIVE','SUSPENDED');
  END IF;
END
$$;

-- 2. Workspace tables. --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."Organisation" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Organisation_slug_key" ON public."Organisation" ("slug");

CREATE TABLE IF NOT EXISTS public."Department" (
  "id"        TEXT NOT NULL,
  "orgId"     TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Department_orgId_name_key"
  ON public."Department" ("orgId", "name");

CREATE TABLE IF NOT EXISTS public."Membership" (
  "id"           TEXT NOT NULL,
  "orgId"        TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "role"         public."MemberRole"   NOT NULL DEFAULT 'DEVELOPER',
  "status"       public."MemberStatus" NOT NULL DEFAULT 'INVITED',
  "title"        TEXT,
  "departmentId" TEXT,
  "invitedAt"    TIMESTAMP(3),
  "joinedAt"     TIMESTAMP(3),
  "lastActiveAt" TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_orgId_userId_key"
  ON public."Membership" ("orgId", "userId");
CREATE INDEX IF NOT EXISTS "Membership_orgId_status_idx"
  ON public."Membership" ("orgId", "status");

-- 3. orgId on every table that holds business data. ---------------------------
-- Nullable so the column can land before the backfill and no existing row can
-- violate it. Auth plumbing (Account, Session) and API plumbing
-- (IdempotencyRecord) are deliberately untouched: they belong to a person or a
-- request, not to a workspace.
ALTER TABLE public."BusinessProfile" ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE public."Client"          ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE public."Document"        ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE public."Payment"         ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE public."ApiKey"          ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE crm."Pipeline"           ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE crm."Deal"               ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE crm."Contact"            ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE crm."Project"            ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE crm."CompanyProfile"     ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE crm."Activity"           ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE crm."Task"               ADD COLUMN IF NOT EXISTS "orgId" TEXT;
ALTER TABLE crm."SyncLog"            ADD COLUMN IF NOT EXISTS "orgId" TEXT;

CREATE INDEX IF NOT EXISTS "BusinessProfile_orgId_idx" ON public."BusinessProfile" ("orgId");
CREATE INDEX IF NOT EXISTS "Client_orgId_idx"          ON public."Client" ("orgId");
CREATE INDEX IF NOT EXISTS "Document_orgId_idx"        ON public."Document" ("orgId");
CREATE INDEX IF NOT EXISTS "Payment_orgId_idx"         ON public."Payment" ("orgId");
CREATE INDEX IF NOT EXISTS "ApiKey_orgId_idx"          ON public."ApiKey" ("orgId");
CREATE INDEX IF NOT EXISTS "Pipeline_orgId_idx"        ON crm."Pipeline" ("orgId");
CREATE INDEX IF NOT EXISTS "Deal_orgId_idx"            ON crm."Deal" ("orgId");
CREATE INDEX IF NOT EXISTS "Contact_orgId_idx"         ON crm."Contact" ("orgId");
CREATE INDEX IF NOT EXISTS "Project_orgId_idx"         ON crm."Project" ("orgId");
CREATE INDEX IF NOT EXISTS "CompanyProfile_orgId_idx"  ON crm."CompanyProfile" ("orgId");
CREATE INDEX IF NOT EXISTS "Activity_orgId_idx"        ON crm."Activity" ("orgId");
CREATE INDEX IF NOT EXISTS "Task_orgId_idx"            ON crm."Task" ("orgId");
CREATE INDEX IF NOT EXISTS "SyncLog_orgId_idx"         ON crm."SyncLog" ("orgId");

-- 4. Foreign keys. ------------------------------------------------------------
-- Guarded by name because ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
DECLARE
  t RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_orgId_fkey') THEN
    ALTER TABLE public."Membership" ADD CONSTRAINT "Membership_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_userId_fkey') THEN
    ALTER TABLE public."Membership" ADD CONSTRAINT "Membership_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_departmentId_fkey') THEN
    ALTER TABLE public."Membership" ADD CONSTRAINT "Membership_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES public."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Department_orgId_fkey') THEN
    ALTER TABLE public."Department" ADD CONSTRAINT "Department_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  FOR t IN
    SELECT * FROM (VALUES
      ('public','BusinessProfile'), ('public','Client'), ('public','Document'),
      ('public','Payment'), ('public','ApiKey'),
      ('crm','Pipeline'), ('crm','Deal'), ('crm','Contact'), ('crm','Project'),
      ('crm','CompanyProfile'), ('crm','Activity'), ('crm','Task'), ('crm','SyncLog')
    ) AS v(sch, tbl)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t.tbl || '_orgId_fkey') THEN
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY ("orgId") '
        'REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        t.sch, t.tbl, t.tbl || '_orgId_fkey');
    END IF;
  END LOOP;
END
$$;

-- 5. Backfill. ----------------------------------------------------------------
DO $$
DECLARE
  v_owner TEXT;
  v_name  TEXT;
  v_slug  TEXT;
  v_org   TEXT;
  v_other INT;
BEGIN
  -- Idempotent: a workspace already exists, so this has run.
  IF EXISTS (SELECT 1 FROM public."Organisation") THEN
    RAISE NOTICE 'Organisation already exists; backfill skipped.';
    RETURN;
  END IF;

  -- The owner is whoever holds the business profile; failing that, whoever
  -- holds the most clients; failing that, the oldest account.
  SELECT u.id, COALESCE(NULLIF(btrim(bp."businessName"), ''), 'My workspace')
    INTO v_owner, v_name
    FROM public."User" u
    LEFT JOIN public."BusinessProfile" bp ON bp."userId" = u.id
   ORDER BY (bp.id IS NOT NULL) DESC,
            (SELECT count(*) FROM public."Client" c WHERE c."userId" = u.id) DESC,
            u."createdAt" ASC
   LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE NOTICE 'No users; nothing to backfill.';
    RETURN;
  END IF;

  -- The guard that matters. Every row in this database is about to be pulled
  -- into one workspace. If a second account also owns business records, those
  -- are plausibly a different business, and merging them would expose one
  -- company's clients to another. Refuse and let a human decide.
  SELECT count(*) INTO v_other
    FROM public."User" u
   WHERE u.id <> v_owner
     AND ( EXISTS (SELECT 1 FROM public."Client"   x WHERE x."userId" = u.id)
        OR EXISTS (SELECT 1 FROM public."Document" x WHERE x."userId" = u.id)
        OR EXISTS (SELECT 1 FROM crm."Deal"        x WHERE x."userId" = u.id)
        OR EXISTS (SELECT 1 FROM crm."Project"     x WHERE x."userId" = u.id) );

  IF v_other > 0 THEN
    RAISE EXCEPTION
      'Refusing to backfill: % other account(s) own business records. Merging them into a single workspace would expose data across businesses. Assign orgId by hand instead.', v_other;
  END IF;

  v_slug := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  IF v_slug = '' THEN v_slug := 'workspace'; END IF;

  v_org := gen_random_uuid()::text;
  INSERT INTO public."Organisation" (id, name, slug, "createdAt", "updatedAt")
  VALUES (v_org, v_name, v_slug, now(), now());

  INSERT INTO public."Department" (id, "orgId", name, "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, v_org, d, now(), now()
    FROM unnest(ARRAY['Sales','Development','Operations','Admin']) AS d;

  -- The data holder owns the workspace; everyone else joins as an admin. Only
  -- reachable when those accounts own nothing, per the guard above.
  INSERT INTO public."Membership" (id,"orgId","userId",role,status,"joinedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, v_org, u.id,
         CASE WHEN u.id = v_owner THEN 'OWNER' ELSE 'ADMIN' END::public."MemberRole",
         CASE WHEN u.status = 'ACTIVE' THEN 'ACTIVE' ELSE 'SUSPENDED' END::public."MemberStatus",
         now(), now(), now()
    FROM public."User" u;

  UPDATE public."BusinessProfile" SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE public."Client"          SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE public."Document"        SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE public."Payment"         SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE public."ApiKey"          SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE crm."Pipeline"           SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE crm."Deal"               SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE crm."Contact"            SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE crm."Project"            SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE crm."CompanyProfile"     SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE crm."Activity"           SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE crm."Task"               SET "orgId" = v_org WHERE "orgId" IS NULL;
  UPDATE crm."SyncLog"            SET "orgId" = v_org WHERE "orgId" IS NULL;

  RAISE NOTICE 'Workspace "%" created; all business records assigned.', v_name;
END
$$;
