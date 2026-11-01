-- Proposals: one new table and one new enum.
--
-- Purely additive. No existing table gains, loses or retypes a column, and no
-- existing row is read or rewritten - a proposal points at a Client, a Client
-- does not point at a proposal.
--
-- Numbering lives on the new table (a per-client "sequence") rather than as a
-- new counter column on Client, so the app keeps working unchanged on a
-- database where this migration has not run yet.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'ProposalStatus' AND n.nspname = 'public') THEN
    CREATE TYPE public."ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public."Proposal" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "orgId"           TEXT,
  "clientId"        TEXT NOT NULL,
  "createdById"     TEXT,
  "sequence"        INTEGER NOT NULL,
  "refNumber"       TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "status"          public."ProposalStatus" NOT NULL DEFAULT 'DRAFT',
  "currency"        TEXT NOT NULL,
  "totalAmount"     DECIMAL(12,2),
  "input"           JSONB NOT NULL,
  "content"         JSONB NOT NULL,
  "model"           TEXT,
  "issueDate"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil"      TIMESTAMP(3),
  "statusChangedAt" TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Proposal_userId_refNumber_key"  ON public."Proposal" ("userId", "refNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Proposal_clientId_sequence_key" ON public."Proposal" ("clientId", "sequence");
CREATE INDEX IF NOT EXISTS "Proposal_userId_createdAt_idx"         ON public."Proposal" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Proposal_orgId_idx"                    ON public."Proposal" ("orgId");

-- CASCADE from the client as well as the account: a proposal is written TO a
-- client, and deleting the client (an admin-only, typed-confirmation action)
-- already removes their documents the same way.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Proposal_userId_fkey') THEN
    ALTER TABLE public."Proposal" ADD CONSTRAINT "Proposal_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Proposal_orgId_fkey') THEN
    ALTER TABLE public."Proposal" ADD CONSTRAINT "Proposal_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Proposal_clientId_fkey') THEN
    ALTER TABLE public."Proposal" ADD CONSTRAINT "Proposal_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES public."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- Every other table in "public" has row-level security on with no policies,
-- which is what keeps the Supabase anon key from reading it through the REST
-- API. The app reaches this table through Prisma as the table owner, which
-- RLS does not restrict, so this changes nothing for the app and closes the
-- table to everyone else.
ALTER TABLE public."Proposal" ENABLE ROW LEVEL SECURITY;
