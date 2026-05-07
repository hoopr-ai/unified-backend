-- Phase 2 studio-backend-ts new tables.
-- Run ONCE against sage_staging (and later prod).
-- All CREATE TABLE use IF NOT EXISTS so safe to re-run.

BEGIN;

-- ────────── bank_details ──────────
CREATE TABLE IF NOT EXISTS bank_details (
    id                    BIGSERIAL PRIMARY KEY,
    "userId"              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "accountHolderName"   VARCHAR(255) NOT NULL,
    "bankName"            VARCHAR(255) NOT NULL,
    "accountNumber"       TEXT NOT NULL,          -- encrypted
    "branchName"          VARCHAR(255),
    "ifscCode"            TEXT NOT NULL,          -- encrypted
    "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_details_user_id
    ON bank_details ("userId");


-- ────────── user_entity_details ──────────
CREATE TABLE IF NOT EXISTS user_entity_details (
    id              BIGSERIAL PRIMARY KEY,
    "userId"        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "labelName"     VARCHAR(255),
    "entityType"    VARCHAR(100),
    email           VARCHAR(255),
    "phoneNumber"   VARCHAR(50),
    "countryCode"   VARCHAR(10),
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_entity_details_user_id
    ON user_entity_details ("userId");


-- ────────── user_addresses ──────────
CREATE TABLE IF NOT EXISTS user_addresses (
    id              BIGSERIAL PRIMARY KEY,
    "userId"        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "addressType"   VARCHAR(50) NOT NULL,         -- BUSINESS | BILLING
    "addressLine1"  VARCHAR(255) NOT NULL,
    "addressLine2"  VARCHAR(255),
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(100) NOT NULL,
    "postalCode"    VARCHAR(20) NOT NULL,
    country         VARCHAR(100) NOT NULL,
    pan             TEXT,                          -- encrypted
    gstin           TEXT,                          -- encrypted
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_address_type
    ON user_addresses ("userId", "addressType");


-- ────────── user_redemptions ──────────
CREATE TABLE IF NOT EXISTS user_redemptions (
    id           BIGSERIAL PRIMARY KEY,
    "userId"     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount       NUMERIC(15, 2) NOT NULL,
    status       VARCHAR(20) NOT NULL,             -- P | A | R | C
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_redemption_user_id
    ON user_redemptions ("userId");

CREATE INDEX IF NOT EXISTS idx_user_redemption_status
    ON user_redemptions (status);


-- ────────── contact_us (shared across studio / enterprise / app) ──────────
CREATE TABLE IF NOT EXISTS contact_us (
    id            BIGSERIAL PRIMARY KEY,
    platform      VARCHAR(50) NOT NULL,            -- STUDIO | ENTERPRISE | SOUND_TRACKING_APP | INTERNAL
    name          VARCHAR(255) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    mobile        VARCHAR(50),
    "brandName"   VARCHAR(255),
    message       TEXT,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_us_platform
    ON contact_us (platform);

CREATE INDEX IF NOT EXISTS idx_contact_us_email
    ON contact_us (email);

COMMIT;
