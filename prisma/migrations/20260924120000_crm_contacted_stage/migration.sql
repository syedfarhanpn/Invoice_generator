-- Adds a "Contacted" stage to every pipeline that does not have one.
--
-- The pipeline came from an earlier codebase with six stages, which left a
-- lead you have replied to but not yet qualified with nowhere to sit. Stages
-- are rows rather than an enum, so this is a data change, not a schema one.
--
-- Guarded by NOT EXISTS so a re-run neither duplicates the stage nor shifts
-- the positions a second time.

UPDATE crm."Stage" s
   SET position = s.position + 1,
       "updatedAt" = now()
  FROM crm."Pipeline" p
 WHERE s."pipelineId" = p.id
   AND s.position >= 1
   AND NOT EXISTS (
     SELECT 1 FROM crm."Stage" x
      WHERE x."pipelineId" = p.id AND x.name = 'Contacted'
   );

INSERT INTO crm."Stage" (id, "pipelineId", name, position, probability, type, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p.id, 'Contacted', 1, 15, 'OPEN', now(), now()
  FROM crm."Pipeline" p
 WHERE p."archivedAt" IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM crm."Stage" x
      WHERE x."pipelineId" = p.id AND x.name = 'Contacted'
   );
