-- Generalises the pipeline into a board that three panels share, and adds
-- Projects plus board placement and reminders for Tasks.
--
-- Entirely additive. Nothing is dropped, nothing is rewritten, and every
-- existing Pipeline row becomes a LEADS board by way of the column default,
-- so the CRM keeps working exactly as it did the moment this lands.
--
-- Guarded throughout so a re-run is a no-op: the CRM tables are shared with an
-- earlier codebase and this must never be the migration that surprises it.

-- 1. What a board holds. -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typname = 'PipelineKind' AND n.nspname = 'crm'
  ) THEN
    CREATE TYPE crm."PipelineKind" AS ENUM ('LEADS', 'PROJECTS', 'TASKS');
  END IF;
END
$$;

ALTER TABLE crm."Pipeline"
  ADD COLUMN IF NOT EXISTS "kind" crm."PipelineKind" NOT NULL DEFAULT 'LEADS';

-- 2. Projects. ---------------------------------------------------------------
-- Separate from Deal because selling the work and doing the work are different
-- lifecycles. sourceDealId is UNIQUE so accepting the "start a project from
-- this?" prompt twice cannot produce two projects from one deal.
CREATE TABLE IF NOT EXISTS crm."Project" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "pipelineId"   TEXT NOT NULL,
  "stageId"      TEXT NOT NULL,
  "clientId"     TEXT,
  "sourceDealId" TEXT,
  "title"        TEXT NOT NULL,
  "description"  TEXT,
  "value"        DECIMAL(12,2),
  "currency"     TEXT NOT NULL DEFAULT 'INR',
  "startedAt"    TIMESTAMP(3),
  "deadline"     TIMESTAMP(3),
  "position"     INTEGER NOT NULL DEFAULT 0,
  "archivedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Project_sourceDealId_key"
  ON crm."Project" ("sourceDealId");

CREATE INDEX IF NOT EXISTS "Project_userId_stageId_position_idx"
  ON crm."Project" ("userId", "stageId", "position");

-- 3. Board placement and reminders for Tasks. --------------------------------
-- All nullable: a follow-up created against a deal belongs to no column, and
-- `status` stays the source of truth for done-ness. remindAt is kept apart from
-- dueAt so a reminder can lead the deadline.
ALTER TABLE crm."Task"
  ADD COLUMN IF NOT EXISTS "projectId"  TEXT,
  ADD COLUMN IF NOT EXISTS "pipelineId" TEXT,
  ADD COLUMN IF NOT EXISTS "stageId"    TEXT,
  ADD COLUMN IF NOT EXISTS "position"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "remindAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Task_userId_status_remindAt_idx"
  ON crm."Task" ("userId", "status", "remindAt");

CREATE INDEX IF NOT EXISTS "Task_userId_stageId_position_idx"
  ON crm."Task" ("userId", "stageId", "position");

-- 4. Foreign keys. -----------------------------------------------------------
-- Added separately and guarded by name, because ALTER TABLE ... ADD CONSTRAINT
-- has no IF NOT EXISTS. Actions mirror what Prisma would emit for each
-- relation's optionality.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_userId_fkey') THEN
    ALTER TABLE crm."Project" ADD CONSTRAINT "Project_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public."User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_pipelineId_fkey') THEN
    ALTER TABLE crm."Project" ADD CONSTRAINT "Project_pipelineId_fkey"
      FOREIGN KEY ("pipelineId") REFERENCES crm."Pipeline"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_stageId_fkey') THEN
    ALTER TABLE crm."Project" ADD CONSTRAINT "Project_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES crm."Stage"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_clientId_fkey') THEN
    ALTER TABLE crm."Project" ADD CONSTRAINT "Project_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES public."Client"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_sourceDealId_fkey') THEN
    ALTER TABLE crm."Project" ADD CONSTRAINT "Project_sourceDealId_fkey"
      FOREIGN KEY ("sourceDealId") REFERENCES crm."Deal"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_projectId_fkey') THEN
    ALTER TABLE crm."Task" ADD CONSTRAINT "Task_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES crm."Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_pipelineId_fkey') THEN
    ALTER TABLE crm."Task" ADD CONSTRAINT "Task_pipelineId_fkey"
      FOREIGN KEY ("pipelineId") REFERENCES crm."Pipeline"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_stageId_fkey') THEN
    ALTER TABLE crm."Task" ADD CONSTRAINT "Task_stageId_fkey"
      FOREIGN KEY ("stageId") REFERENCES crm."Stage"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
