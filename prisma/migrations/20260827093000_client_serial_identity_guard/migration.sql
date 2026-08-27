-- Protect the parts of Client that issued reference numbers depend on.
--
-- WHY NOW: until now this app was the only writer, and the lock lived in
-- TypeScript (src/app/dashboard/clients/actions.ts, and the deliberate
-- omission of `code` from the update in src/app/api/v1/clients/[id]/route.ts).
-- The CRM writes to this same row directly, so app-level enforcement no longer
-- covers every path into the table. Moving the rule into the database covers
-- both apps - and every later one - without either needing to know about it.
--
-- Three separate invariants, deliberately not one blanket "read-only" rule:
--
--   clientNumber  permanent internal id; never reassigned after insert.
--   *Seq          may only advance. Lowering one would re-issue a reference
--                 number that has already gone out to a client.
--   code          embedded in every refNumber ever issued (INV-ACME-001), so
--                 it locks the moment the first document is finalized. Before
--                 that it stays editable, which the client form relies on.

CREATE OR REPLACE FUNCTION public.enforce_client_serial_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."clientNumber" IS DISTINCT FROM OLD."clientNumber" THEN
    RAISE EXCEPTION
      'Client.clientNumber is immutable (client %: % -> %)',
      OLD."id", OLD."clientNumber", NEW."clientNumber"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."invoiceSeq"  < OLD."invoiceSeq"
     OR NEW."contractSeq" < OLD."contractSeq"
     OR NEW."quoteSeq"    < OLD."quoteSeq"
     OR NEW."proformaSeq" < OLD."proformaSeq" THEN
    RAISE EXCEPTION
      'Client serial counters may only increase (client %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    -- refNumber IS NOT NULL is the precise test: it is assigned at finalize and
    -- is the thing that embeds the code. A VOID document still counts, because
    -- its number stays allocated and must never be handed out again.
    IF EXISTS (
      SELECT 1 FROM public."Document"
      WHERE "clientId" = OLD."id" AND "refNumber" IS NOT NULL
    ) THEN
      RAISE EXCEPTION
        'Client.code is locked once a document has been finalized (client %: % -> %)',
        OLD."id", OLD."code", NEW."code"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "client_serial_identity_guard" ON public."Client";

CREATE TRIGGER "client_serial_identity_guard"
  BEFORE UPDATE ON public."Client"
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_client_serial_identity();
