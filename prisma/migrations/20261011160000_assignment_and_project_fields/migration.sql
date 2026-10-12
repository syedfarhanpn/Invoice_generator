-- Assignment, and the two project fields the delivery board needs.
--
-- Entirely additive. Every column is nullable, so no existing row can violate
-- it: an unassigned lead and a project with no manager are real states, and
-- the ones the inbox and the workload view are meant to surface.
--
-- Members live in public."Membership" while deals, projects and tasks live in
-- crm. The foreign keys cross schemas, which this database already does for
-- User and Client.

ALTER TABLE crm."Deal"    ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE crm."Task"    ADD COLUMN IF NOT EXISTS "assigneeId"   TEXT;
ALTER TABLE crm."Project" ADD COLUMN IF NOT EXISTS "managerId"    TEXT;
ALTER TABLE crm."Project" ADD COLUMN IF NOT EXISTS "category"     TEXT;
ALTER TABLE crm."Project" ADD COLUMN IF NOT EXISTS "progress"     INTEGER;

CREATE INDEX IF NOT EXISTS "Deal_assignedToId_idx"  ON crm."Deal"    ("assignedToId");
CREATE INDEX IF NOT EXISTS "Task_assigneeId_idx"    ON crm."Task"    ("assigneeId");
CREATE INDEX IF NOT EXISTS "Project_managerId_idx"  ON crm."Project" ("managerId");

-- SET NULL rather than CASCADE on every one: removing someone from the
-- workspace must never delete the work they touched. It unassigns it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_assignedToId_fkey') THEN
    ALTER TABLE crm."Deal" ADD CONSTRAINT "Deal_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES public."Membership"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_assigneeId_fkey') THEN
    ALTER TABLE crm."Task" ADD CONSTRAINT "Task_assigneeId_fkey"
      FOREIGN KEY ("assigneeId") REFERENCES public."Membership"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_managerId_fkey') THEN
    ALTER TABLE crm."Project" ADD CONSTRAINT "Project_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES public."Membership"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- A progress value outside 0-100 is not a slower project, it is a bug. The
-- constraint is NOT VALID so it applies to new and updated rows without
-- scanning existing ones, which are all NULL anyway.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_progress_range') THEN
    ALTER TABLE crm."Project" ADD CONSTRAINT "Project_progress_range"
      CHECK ("progress" IS NULL OR ("progress" >= 0 AND "progress" <= 100)) NOT VALID;
  END IF;
END
$$;
