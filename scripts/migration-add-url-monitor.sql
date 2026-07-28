-- URL Monitoring (internal-fe Tech Tools) — monitored_urls + monitor_checks.
-- Only needed when DB_SYNC=true is NOT set on the deployment (sequelize.sync
-- create-only would otherwise create these automatically). Idempotent.

CREATE TABLE IF NOT EXISTS monitored_urls (
  id                    BIGSERIAL PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,
  url                   VARCHAR(1024) NOT NULL,
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "notifyEmails"        JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sslAlertDays"        INTEGER NOT NULL DEFAULT 30,
  "lastStatus"          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "lastStatusCode"      INTEGER,
  "lastResponseTimeMs"  INTEGER,
  "lastError"           VARCHAR(512),
  "lastCheckedAt"       TIMESTAMPTZ,
  "downSince"           TIMESTAMPTZ,
  "sslExpiresAt"        TIMESTAMPTZ,
  "sslDaysRemaining"    INTEGER,
  "sslIssuer"           VARCHAR(255),
  "sslError"            VARCHAR(512),
  "lastDownAlertAt"     TIMESTAMPTZ,
  "lastSslAlertAt"      TIMESTAMPTZ,
  "createdBy"           BIGINT,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitor_checks (
  id                BIGSERIAL PRIMARY KEY,
  "urlId"           BIGINT NOT NULL,
  status            VARCHAR(10) NOT NULL,
  "statusCode"      INTEGER,
  "responseTimeMs"  INTEGER,
  error             VARCHAR(512),
  "checkedAt"       TIMESTAMPTZ NOT NULL,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS monitor_checks_url_id_checked_at
  ON monitor_checks ("urlId", "checkedAt");
