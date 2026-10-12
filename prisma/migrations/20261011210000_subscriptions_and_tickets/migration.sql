-- Subscriptions (AMC, domains, hosting) and support tickets.
--
-- Three new tables and two new columns. Nothing is dropped, renamed or
-- rewritten, and the two columns added to existing tables are both nullable
-- or defaulted, so every row you already have stays exactly as it is:
--
--   public."User"    + "ticketSeq"      INTEGER NOT NULL DEFAULT 0
--   crm."Expense"    + "subscriptionId" TEXT NULL
--
-- Why one Subscription table rather than separate AMC, Domain and Hosting
-- tables: they are the same fact - a commitment that comes due on a date -
-- and the view that earns its keep is "what expires in the next sixty days"
-- across all of them. `kind` is what the Renewals and Domains pages filter on.
--
-- Note what is NOT a column: expiring, due, overdue, lapsed. All four are
-- "renewsOn" compared against now. A stored copy would be wrong the moment
-- nobody opened the page.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'SubscriptionKind' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."SubscriptionKind" AS ENUM ('AMC', 'DOMAIN', 'HOSTING', 'SSL', 'EMAIL', 'OTHER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'BillingCycle' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'BIENNIAL', 'TRIENNIAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'SubscriptionStatus' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'TicketStatus' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CLIENT', 'RESOLVED', 'CLOSED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'TicketPriority' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'TicketChannel' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."TicketChannel" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'IN_PERSON', 'PORTAL', 'OTHER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE t.typname = 'TicketReplyVisibility' AND n.nspname = 'crm') THEN
    CREATE TYPE crm."TicketReplyVisibility" AS ENUM ('PUBLIC', 'INTERNAL');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Subscription
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm."Subscription" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "orgId"         TEXT,
  "kind"          crm."SubscriptionKind" NOT NULL,
  "name"          TEXT NOT NULL,
  "clientId"      TEXT,
  "projectId"     TEXT,
  "provider"      TEXT,
  -- An identifier at the provider, never a credential.
  "accountRef"    TEXT,
  "startsOn"      TIMESTAMP(3) NOT NULL,
  "renewsOn"      TIMESTAMP(3) NOT NULL,
  "cycle"         crm."BillingCycle" NOT NULL DEFAULT 'YEARLY',
  -- What we pay out per cycle, and what the client pays us. Kept apart so the
  -- margin on resold hosting is recorded rather than inferred.
  "cost"          DECIMAL(12,2),
  "price"         DECIMAL(12,2),
  "currency"      TEXT NOT NULL DEFAULT 'INR',
  "autoRenew"     BOOLEAN NOT NULL DEFAULT false,
  "status"        crm."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastRenewedAt" TIMESTAMP(3),
  "ownerId"       TEXT,
  "notes"         TEXT,
  "archivedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Subscription_userId_renewsOn_idx"      ON crm."Subscription" ("userId", "renewsOn");
CREATE INDEX IF NOT EXISTS "Subscription_userId_kind_renewsOn_idx" ON crm."Subscription" ("userId", "kind", "renewsOn");
CREATE INDEX IF NOT EXISTS "Subscription_orgId_idx"                ON crm."Subscription" ("orgId");
CREATE INDEX IF NOT EXISTS "Subscription_clientId_idx"             ON crm."Subscription" ("clientId");
CREATE INDEX IF NOT EXISTS "Subscription_projectId_idx"            ON crm."Subscription" ("projectId");

-- ---------------------------------------------------------------------------
-- Ticket
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm."Ticket" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "orgId"            TEXT,
  "number"           INTEGER NOT NULL,
  "subject"          TEXT NOT NULL,
  "body"             TEXT,
  "clientId"         TEXT,
  "projectId"        TEXT,
  "contactId"        TEXT,
  "status"           crm."TicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority"         crm."TicketPriority" NOT NULL DEFAULT 'NORMAL',
  "channel"          crm."TicketChannel" NOT NULL DEFAULT 'EMAIL',
  "assigneeId"       TEXT,
  "dueAt"            TIMESTAMP(3),
  "firstRespondedAt" TIMESTAMP(3),
  "resolvedAt"       TIMESTAMP(3),
  "closedAt"         TIMESTAMP(3),
  "archivedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- Two tickets in one workspace must never share a number. The allocator takes
-- a row lock on User, exactly as document serials do; this is the backstop if
-- that lock is ever bypassed.
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_userId_number_key"    ON crm."Ticket" ("userId", "number");
CREATE INDEX IF NOT EXISTS "Ticket_userId_status_createdAt_idx" ON crm."Ticket" ("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Ticket_orgId_idx"                   ON crm."Ticket" ("orgId");
CREATE INDEX IF NOT EXISTS "Ticket_clientId_idx"                ON crm."Ticket" ("clientId");
CREATE INDEX IF NOT EXISTS "Ticket_projectId_idx"               ON crm."Ticket" ("projectId");
CREATE INDEX IF NOT EXISTS "Ticket_assigneeId_idx"              ON crm."Ticket" ("assigneeId");

-- ---------------------------------------------------------------------------
-- TicketReply
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crm."TicketReply" (
  "id"         TEXT NOT NULL,
  "ticketId"   TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "authorId"   TEXT,
  -- Direction and visibility are separate facts: a message FROM the client is
  -- always public, but one from us may be an internal note.
  "fromClient" BOOLEAN NOT NULL DEFAULT false,
  "visibility" crm."TicketReplyVisibility" NOT NULL DEFAULT 'PUBLIC',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TicketReply_ticketId_createdAt_idx" ON crm."TicketReply" ("ticketId", "createdAt");

-- ---------------------------------------------------------------------------
-- Columns on existing tables
--
-- Both are additive. ticketSeq defaults to 0, which is correct for every
-- existing account: nobody has been handed a ticket number yet.
-- ---------------------------------------------------------------------------

ALTER TABLE public."User"  ADD COLUMN IF NOT EXISTS "ticketSeq"      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm."Expense"  ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;

CREATE INDEX IF NOT EXISTS "Expense_subscriptionId_idx" ON crm."Expense" ("subscriptionId");

-- ---------------------------------------------------------------------------
-- Foreign keys
--
-- SET NULL wherever the parent is context rather than ownership: deleting a
-- client must not erase the record that their domain expires in March, and
-- removing a team member must not delete the tickets they were handling.
-- CASCADE only from the owning account, the workspace, and a ticket to its
-- own replies.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_userId_fkey') THEN
    ALTER TABLE crm."Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_orgId_fkey') THEN
    ALTER TABLE crm."Subscription" ADD CONSTRAINT "Subscription_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_clientId_fkey') THEN
    ALTER TABLE crm."Subscription" ADD CONSTRAINT "Subscription_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES public."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_projectId_fkey') THEN
    ALTER TABLE crm."Subscription" ADD CONSTRAINT "Subscription_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES crm."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_ownerId_fkey') THEN
    ALTER TABLE crm."Subscription" ADD CONSTRAINT "Subscription_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES public."Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Ticket_userId_fkey') THEN
    ALTER TABLE crm."Ticket" ADD CONSTRAINT "Ticket_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Ticket_orgId_fkey') THEN
    ALTER TABLE crm."Ticket" ADD CONSTRAINT "Ticket_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES public."Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Ticket_clientId_fkey') THEN
    ALTER TABLE crm."Ticket" ADD CONSTRAINT "Ticket_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES public."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Ticket_projectId_fkey') THEN
    ALTER TABLE crm."Ticket" ADD CONSTRAINT "Ticket_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES crm."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Ticket_contactId_fkey') THEN
    ALTER TABLE crm."Ticket" ADD CONSTRAINT "Ticket_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES crm."Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Ticket_assigneeId_fkey') THEN
    ALTER TABLE crm."Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey"
      FOREIGN KEY ("assigneeId") REFERENCES public."Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- A reply has no meaning without its ticket, so this one cascades.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TicketReply_ticketId_fkey') THEN
    ALTER TABLE crm."TicketReply" ADD CONSTRAINT "TicketReply_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES crm."Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TicketReply_authorId_fkey') THEN
    ALTER TABLE crm."TicketReply" ADD CONSTRAINT "TicketReply_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES public."Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  -- SET NULL, not CASCADE: deleting a subscription must not delete the record
  -- of money that actually left the bank.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_subscriptionId_fkey') THEN
    ALTER TABLE crm."Expense" ADD CONSTRAINT "Expense_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES crm."Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Rules the application must not be able to break
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Money owed or charged is never negative.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_cost_non_negative') THEN
    ALTER TABLE crm."Subscription" ADD CONSTRAINT "Subscription_cost_non_negative"
      CHECK ("cost" IS NULL OR "cost" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_price_non_negative') THEN
    ALTER TABLE crm."Subscription" ADD CONSTRAINT "Subscription_price_non_negative"
      CHECK ("price" IS NULL OR "price" >= 0);
  END IF;

  -- A renewal cannot fall due before the thing started. Without this, a
  -- mistyped year silently produces a subscription that is permanently
  -- "overdue" and sits at the top of the renewals list forever.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subscription_renews_after_start') THEN
    ALTER TABLE crm."Subscription" ADD CONSTRAINT "Subscription_renews_after_start"
      CHECK ("renewsOn" >= "startsOn");
  END IF;

  -- A ticket number is handed out from a counter that starts at 1.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Ticket_number_positive') THEN
    ALTER TABLE crm."Ticket" ADD CONSTRAINT "Ticket_number_positive"
      CHECK ("number" > 0);
  END IF;

  -- A message from the client is something the client said; it can never be
  -- an internal note. This is the one mistake the module must not allow.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TicketReply_client_messages_are_public') THEN
    ALTER TABLE crm."TicketReply" ADD CONSTRAINT "TicketReply_client_messages_are_public"
      CHECK (NOT ("fromClient" AND "visibility" = 'INTERNAL'));
  END IF;
END
$$;
