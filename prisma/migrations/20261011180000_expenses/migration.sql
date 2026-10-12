-- Expenses.
--
-- Entirely new: no existing table is touched, so nothing here can disturb a
-- single record you already have.
--
-- The one thing worth reading closely is the CHECK at the bottom. Every
-- expense is either attributable to one project or it is company overhead -
-- never both, never neither. Enforcing that in the database rather than only
-- in the form is what makes the reports trustworthy: aggregating by project
-- and by department cannot double-count a row, and overhead cannot quietly
-- vanish from a project-wise total.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'ExpenseScope' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."ExpenseScope" AS ENUM ('PROJECT', 'OVERHEAD');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'ExpenseStatus' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."ExpenseStatus" AS ENUM ('PAID', 'PENDING', 'PARTIALLY_PAID', 'OVERDUE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'ExpenseRecurrence' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."ExpenseRecurrence" AS ENUM ('ONE_OFF', 'MONTHLY', 'QUARTERLY', 'YEARLY');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS crm."Expense" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "orgId"         TEXT,
  "title"         TEXT NOT NULL,
  "category"      TEXT NOT NULL,
  "amount"        DECIMAL(12,2) NOT NULL,
  "currency"      TEXT NOT NULL DEFAULT 'INR',
  "spentOn"       TIMESTAMP(3) NOT NULL,
  "vendor"        TEXT,
  "paymentMethod" TEXT,
  "status"        crm."ExpenseStatus" NOT NULL DEFAULT 'PAID',
  "notes"         TEXT,
  "scope"         crm."ExpenseScope" NOT NULL DEFAULT 'OVERHEAD',
  "projectId"     TEXT,
  "departmentId"  TEXT,
  "recurrence"    crm."ExpenseRecurrence" NOT NULL DEFAULT 'ONE_OFF',
  "nextDueOn"     TIMESTAMP(3),
  "recordedById"  TEXT,
  "archivedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Expense_userId_spentOn_idx"   ON crm."Expense" ("userId", "spentOn");
CREATE INDEX IF NOT EXISTS "Expense_orgId_idx"            ON crm."Expense" ("orgId");
CREATE INDEX IF NOT EXISTS "Expense_projectId_idx"        ON crm."Expense" ("projectId");
CREATE INDEX IF NOT EXISTS "Expense_departmentId_idx"     ON crm."Expense" ("departmentId");
CREATE INDEX IF NOT EXISTS "Expense_userId_scope_idx"     ON crm."Expense" ("userId", "scope");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_userId_fkey') THEN
    ALTER TABLE crm."Expense" ADD CONSTRAINT "Expense_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_orgId_fkey') THEN
    ALTER TABLE crm."Expense" ADD CONSTRAINT "Expense_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- SET NULL, not CASCADE: deleting a project must not erase what it cost.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_projectId_fkey') THEN
    ALTER TABLE crm."Expense" ADD CONSTRAINT "Expense_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES crm."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_departmentId_fkey') THEN
    ALTER TABLE crm."Expense" ADD CONSTRAINT "Expense_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES public."Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_recordedById_fkey') THEN
    ALTER TABLE crm."Expense" ADD CONSTRAINT "Expense_recordedById_fkey"
      FOREIGN KEY ("recordedById") REFERENCES public."Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- The rule that makes the reports trustworthy.
--
-- A PROJECT expense must name its project; an OVERHEAD expense must not. A
-- SET NULL on project deletion would otherwise leave a PROJECT-scoped row
-- pointing at nothing, so that case is handled in application code by moving
-- the row to OVERHEAD before the project goes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_scope_project_pairing') THEN
    ALTER TABLE crm."Expense" ADD CONSTRAINT "Expense_scope_project_pairing"
      CHECK (
        ("scope" = 'PROJECT'  AND "projectId" IS NOT NULL) OR
        ("scope" = 'OVERHEAD' AND "projectId" IS NULL)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_amount_non_negative') THEN
    ALTER TABLE crm."Expense" ADD CONSTRAINT "Expense_amount_non_negative"
      CHECK ("amount" >= 0);
  END IF;
END
$$;
