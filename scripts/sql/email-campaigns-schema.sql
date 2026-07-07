-- Email Campaigns module — table DDL matching the Sequelize models in
-- services/persistence-service/email-campaign/schemas/*.
-- Idempotent: safe to run more than once, and safe alongside a later
-- DB_SYNC=true boot (create-only sync skips existing tables).
--
-- Run with: psql "$DATABASE_URL" -f scripts/sql/email-campaigns-schema.sql

-- ─── Enum types (named exactly as Sequelize would name them) ─────────────────

DO $$ BEGIN
  CREATE TYPE "enum_email_campaigns_status" AS ENUM
    ('draft', 'ready', 'running', 'paused', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "enum_email_campaign_recipients_status" AS ENUM
    ('pending', 'processing', 'sent', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "enum_email_suppressions_reason" AS ENUM
    ('bounce', 'complaint', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "enum_email_events_type" AS ENUM
    ('bounce', 'complaint', 'delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── email_campaigns ─────────────────────────────────────────────────────────
-- dailyQuota/ratePerSec defaults sit below the SES account limits
-- (50,000/day, 14/sec) so transactional mail keeps headroom.

CREATE TABLE IF NOT EXISTS "email_campaigns" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"            VARCHAR(255) NOT NULL,
  "subject"         VARCHAR(255) NOT NULL,
  "html"            TEXT NOT NULL,
  "templateId"      UUID,
  "status"          "enum_email_campaigns_status" NOT NULL DEFAULT 'draft',
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "dailyQuota"      INTEGER NOT NULL DEFAULT 45000,
  "ratePerSec"      INTEGER NOT NULL DEFAULT 10,
  "batchSize"       INTEGER NOT NULL DEFAULT 500,
  "maxAttempts"     INTEGER NOT NULL DEFAULT 2,
  "lockedAt"        TIMESTAMP WITH TIME ZONE,
  "startedAt"       TIMESTAMP WITH TIME ZONE,
  "completedAt"     TIMESTAMP WITH TIME ZONE,
  "createdBy"       BIGINT,
  "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMP WITH TIME ZONE,
  "deletedAt"       TIMESTAMP WITH TIME ZONE
);

-- ─── email_campaign_recipients ───────────────────────────────────────────────
-- One row per (campaign, email): the send ledger AND the work queue.
-- sourceUserId carries the hoopr users.id for rows imported from the legacy
-- system; NULL for CSV-uploaded recipients.

CREATE TABLE IF NOT EXISTS "email_campaign_recipients" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaignId"   UUID NOT NULL REFERENCES "email_campaigns" ("id"),
  "sourceUserId" VARCHAR(255),
  "email"        VARCHAR(255) NOT NULL,
  "name"         VARCHAR(255),
  "status"       "enum_email_campaign_recipients_status" NOT NULL DEFAULT 'pending',
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "messageId"    VARCHAR(255),
  "error"        TEXT,
  "sentAt"       TIMESTAMP WITH TIME ZONE,
  "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS "email_campaign_recipients_campaign_id_status"
  ON "email_campaign_recipients" ("campaignId", "status");

-- Backs the rolling-24h daily-quota count (status='sent' AND sentAt > now-24h)
CREATE INDEX IF NOT EXISTS "email_campaign_recipients_status_sent_at"
  ON "email_campaign_recipients" ("status", "sentAt");

-- Backs SNS bounce/complaint → campaign resolution by SES MessageId
CREATE INDEX IF NOT EXISTS "email_campaign_recipients_message_id"
  ON "email_campaign_recipients" ("messageId");

-- Makes CSV re-uploads idempotent (bulk insert with ignoreDuplicates)
CREATE UNIQUE INDEX IF NOT EXISTS "email_campaign_recipients_campaign_id_email"
  ON "email_campaign_recipients" ("campaignId", "email");

-- ─── email_templates ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "email_templates" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"        VARCHAR(255) NOT NULL,
  "subject"     VARCHAR(255),
  "html"        TEXT NOT NULL,
  "description" TEXT,
  "createdBy"   BIGINT,
  "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP WITH TIME ZONE,
  "deletedAt"   TIMESTAMP WITH TIME ZONE
);

-- ─── email_suppressions ──────────────────────────────────────────────────────
-- Do-not-mail list: permanent bounces, complaints, manual blocks.

CREATE TABLE IF NOT EXISTS "email_suppressions" (
  "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"     VARCHAR(255) NOT NULL,
  "reason"    "enum_email_suppressions_reason" NOT NULL,
  "detail"    TEXT,
  "messageId" VARCHAR(255),
  "createdBy" BIGINT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_suppressions_email"
  ON "email_suppressions" ("email");

-- ─── email_events ────────────────────────────────────────────────────────────
-- Raw SES bounce/complaint events from the SNS webhook (audit + per-campaign
-- bounce/complaint counts). No updatedAt — events are insert-only.

CREATE TABLE IF NOT EXISTS "email_events" (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"       "enum_email_events_type" NOT NULL,
  "email"      VARCHAR(255) NOT NULL,
  "messageId"  VARCHAR(255),
  "campaignId" UUID,
  "detail"     TEXT,
  "payload"    JSONB,
  "createdAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "email_events_message_id"
  ON "email_events" ("messageId");

CREATE INDEX IF NOT EXISTS "email_events_campaign_id_type"
  ON "email_events" ("campaignId", "type");
