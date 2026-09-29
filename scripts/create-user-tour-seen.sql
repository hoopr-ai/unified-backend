-- Onboarding "tour seen" flags for smash (enterprise-fe) coachmark tours.
--
-- The same table studio-backend-ts created (migrations/create_user_tour_seen.sql)
-- on the shared database — this file is byte-for-byte compatible and idempotent,
-- so running it where studio already did is a no-op. One row per (userId, tour);
-- the row's presence IS the seen flag.

CREATE TABLE IF NOT EXISTS user_tour_seen (
    id       SERIAL      PRIMARY KEY,
    "userId" INTEGER     NOT NULL,
    "tour"   VARCHAR(60) NOT NULL,
    "seenAt" TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_tour_seen UNIQUE ("userId", "tour")
);

CREATE INDEX IF NOT EXISTS idx_user_tour_seen_user ON user_tour_seen ("userId");
