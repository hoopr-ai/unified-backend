-- Smash Plus landing page briefs (POST /smash-plus/brief).
-- Mirrors services/persistence-service/smash-plus/schemas/smash-plus-brief.schema.ts.
-- Idempotent. The sequence starts at 1001 so the public reference the FE shows
-- reads "SP-1001", not "SP-1".
CREATE TABLE IF NOT EXISTS smash_plus_briefs (
  id            BIGSERIAL PRIMARY KEY,
  mode          VARCHAR(20)  NOT NULL CHECK (mode IN ('explore', 'brief', 'reco')),
  name          VARCHAR(255) NOT NULL,
  company       VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  placements    TEXT[]       NOT NULL DEFAULT '{}',
  question      TEXT,
  song          TEXT,
  exclusivity   VARCHAR(100),
  budget        VARCHAR(255),
  moods         TEXT[],
  reference     TEXT,
  term          VARCHAR(100),
  territory     VARCHAR(255),
  "goLiveDate"  DATE,
  "userId"      BIGINT,
  "brandId"     BIGINT,
  platform      VARCHAR(50),
  "ipAddress"   VARCHAR(100),
  "userAgent"   TEXT,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smash_plus_briefs_email ON smash_plus_briefs (email);
CREATE INDEX IF NOT EXISTS idx_smash_plus_briefs_user  ON smash_plus_briefs ("userId");

-- Only bump a fresh table; never rewind one that already has briefs.
SELECT setval(pg_get_serial_sequence('smash_plus_briefs', 'id'), 1000, true)
 WHERE NOT EXISTS (SELECT 1 FROM smash_plus_briefs);
