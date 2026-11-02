-- Company integrations: one new table and one new enum.
--
-- Purely additive. No existing table gains, loses or retypes a column, and no
-- existing row is read or rewritten. Until this runs, the app keeps using the
-- server's own Meta and Claude settings as before, for as long as there is
-- only one company for them to belong to.
--
-- The table holds encrypted secrets, so it is locked down twice: row level
-- security with no policies, like every other table here, and no grants at
-- all to the roles the public Supabase API connects as. The app reaches it
-- through its own database connection and is unaffected by either.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'IntegrationProvider' AND n.nspname = 'public') THEN
    CREATE TYPE public."IntegrationProvider" AS ENUM ('META_CAPI', 'ANTHROPIC');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public."CompanyIntegration" (
  "id"         TEXT NOT NULL,
  "orgId"      TEXT NOT NULL,
  "provider"   public."IntegrationProvider" NOT NULL,
  "config"     JSONB,
  "secret"     TEXT NOT NULL,
  "secretHint" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyIntegration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyIntegration_orgId_provider_key"
  ON public."CompanyIntegration" ("orgId", "provider");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyIntegration_orgId_fkey') THEN
    ALTER TABLE public."CompanyIntegration" ADD CONSTRAINT "CompanyIntegration_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE public."CompanyIntegration" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public."CompanyIntegration" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public."CompanyIntegration" FROM authenticated;
  END IF;
END
$$;
