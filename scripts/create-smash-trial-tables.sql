-- Smash 7-day trial — base tables. Idempotent; run once per database before
-- turning SMASH_TRIAL_ENABLED on. Column names are quoted to keep the camelCase
-- the models expect.

-- One row per brand on the trial. UNIQUE("emailDomain") is the hard
-- one-trial-per-company guarantee behind the signup gate.
CREATE TABLE IF NOT EXISTS brand_trials (
    id                   SERIAL       PRIMARY KEY,
    "brandId"            BIGINT       NOT NULL UNIQUE,
    "startedByUserId"    INTEGER      NOT NULL,
    "emailDomain"        VARCHAR(255) NOT NULL UNIQUE,
    "creditsTotal"       INTEGER      NOT NULL,
    "creditsUsed"        INTEGER      NOT NULL DEFAULT 0,
    "startedAt"          TIMESTAMP WITH TIME ZONE NOT NULL,
    "endsAt"             TIMESTAMP WITH TIME ZONE NOT NULL,
    "creditsExhaustedAt" TIMESTAMP WITH TIME ZONE,
    "isExtended"         BOOLEAN      NOT NULL DEFAULT FALSE,
    "extendedAt"         TIMESTAMP WITH TIME ZONE,
    "extendedById"       INTEGER,
    status               VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_brand_trials_credits CHECK ("creditsUsed" >= 0 AND "creditsUsed" <= "creditsTotal")
);

CREATE INDEX IF NOT EXISTS idx_brand_trials_ends_at ON brand_trials ("endsAt");

-- Onboarding answers from complete-profile, queryable per user.
CREATE TABLE IF NOT EXISTS user_onboarding (
    "userId"              INTEGER     PRIMARY KEY,
    "categoryPreferences" VARCHAR(40)[] NOT NULL DEFAULT '{}',
    "discoveryChannel"    VARCHAR(40),
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_categories ON user_onboarding USING GIN ("categoryPreferences");
CREATE INDEX IF NOT EXISTS idx_user_onboarding_channel    ON user_onboarding ("discoveryChannel");

-- The signup gate asks "does any ENTERPRISE user already have this domain?".
-- A plain index on email cannot answer a suffix match, so index the domain.
CREATE INDEX IF NOT EXISTS idx_users_enterprise_email_domain
    ON users (lower(split_part(email, '@', 2)))
    WHERE platform = 'ENTERPRISE';

-- When the trial went live, recorded by the server itself the first time it
-- boots with SMASH_TRIAL_ENABLED=true and never changed after. Only accounts
-- created at/after it can get a trial, so existing users never do. One row
-- (id is pinned to 1); the INSERT … ON CONFLICT DO NOTHING keeps the first value.
CREATE TABLE IF NOT EXISTS smash_trial_launch (
    id           SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    "launchedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── Step 2: conversion journey ──────────────────────────────────────────────

-- activatedAt: first time the trial showed real use after onboarding (came back
-- to the product, licensed, or finished the tutorial). Set once, never cleared.
-- day7Segment: the Day-7 outcome bucket, written once when the window closes.
ALTER TABLE brand_trials ADD COLUMN IF NOT EXISTS "activatedAt"     TIMESTAMP WITH TIME ZONE;
ALTER TABLE brand_trials ADD COLUMN IF NOT EXISTS "day7Segment"     VARCHAR(30);
ALTER TABLE brand_trials ADD COLUMN IF NOT EXISTS "day7EvaluatedAt" TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_brand_trials_started_at ON brand_trials ("startedAt");

-- Every journey send, one row per (subject, slot). The UNIQUE constraint is
-- the 3 + 3 budget: a slot is claimed by inserting its row before sending, so
-- the scheduled tick and the credit-exhaustion trigger can never both send it.
-- subjectKey: "brand:<id>" for trial slots, "user:<id>" for pre-trial
-- onboarding re-triggers, "invitee:<id>" for invite reminders, "email:<addr>"
-- for signup-rejection sales alerts.
CREATE TABLE IF NOT EXISTS trial_journey_sends (
    id                 SERIAL       PRIMARY KEY,
    "subjectKey"       VARCHAR(320) NOT NULL,
    slot               VARCHAR(40)  NOT NULL,
    "brandId"          BIGINT,
    "userId"           INTEGER,
    channel            VARCHAR(20)  NOT NULL,
    variant            VARCHAR(40),
    status             VARCHAR(20)  NOT NULL DEFAULT 'pending',
    "providerMessageId" VARCHAR(255),
    title              VARCHAR(500),
    body               TEXT,
    url                TEXT,
    error              TEXT,
    "sentAt"           TIMESTAMP WITH TIME ZONE,
    "openedAt"         TIMESTAMP WITH TIME ZONE,
    "clickedAt"        TIMESTAMP WITH TIME ZONE,
    "createdAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt"        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_trial_journey_sends_subject_slot UNIQUE ("subjectKey", slot)
);

CREATE INDEX IF NOT EXISTS idx_trial_journey_sends_brand   ON trial_journey_sends ("brandId");
CREATE INDEX IF NOT EXISTS idx_trial_journey_sends_message ON trial_journey_sends ("providerMessageId");

-- FE-only signals the journey routes on (gated "Enterprise Only" views,
-- tutorial skips, push permission, notification opens/clicks, upgrade CTA).
-- Mixpanel remains the analytics store; this is just what the backend needs.
CREATE TABLE IF NOT EXISTS trial_signals (
    id          SERIAL       PRIMARY KEY,
    "userId"    INTEGER      NOT NULL,
    "brandId"   BIGINT,
    kind        VARCHAR(50)  NOT NULL,
    "trackCode" VARCHAR(100),
    "sendId"    INTEGER,
    granted     BOOLEAN,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trial_signals_user_kind  ON trial_signals ("userId", kind, "createdAt");
CREATE INDEX IF NOT EXISTS idx_trial_signals_brand_kind ON trial_signals ("brandId", kind);
