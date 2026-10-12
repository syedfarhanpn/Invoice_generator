-- Assigns a workspace to business rows created after the workspace migration
-- but before the create paths learned to set orgId.
--
-- Those rows were never lost: they still belong to their user and still
-- display, because every query is scoped by userId today. They would fall out
-- of sight the moment that scoping moves to orgId, which is the point of the
-- workspace. This closes that gap before it can bite.
--
-- Each row takes the workspace of its own owner, so this cannot move a record
-- between businesses. Guarded by IS NULL, so a re-run is a no-op.

UPDATE public."BusinessProfile" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE public."Client" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE public."Document" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE public."Payment" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE public."ApiKey" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;

UPDATE crm."Pipeline" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE crm."Deal" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE crm."Contact" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE crm."Project" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE crm."CompanyProfile" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE crm."Activity" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE crm."Task" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
UPDATE crm."SyncLog" t SET "orgId" = m."orgId"
  FROM public."Membership" m WHERE m."userId" = t."userId" AND t."orgId" IS NULL;
