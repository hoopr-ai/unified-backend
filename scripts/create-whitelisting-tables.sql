-- ─── Channel Whitelisting — ops tables ───────────────────────────────────────
--
-- Backs the internal-fe "Channel Whitelisting" CMS (Channels + Claim
-- Clearance). Both surfaces triage rows that already exist in tables
-- OWNED BY OTHER SERVICES:
--
--   soundtracking_user_profiles  written by content-recommendation (Python) and
--                                NATIVE-BE — the creator-side submit flow
--   claims                       owned outright by NATIVE-BE
--
-- Nothing here ALTERs either of them. Ops state lives in side tables keyed by
-- the foreign row's id, so this migration can never break a writer that does
-- not know the CMS exists, and it can be dropped without data loss to the
-- product tables. The one column the CMS does write on a shared table is
-- soundtracking_user_profiles."whitelistStatus" — the column the Python admin
-- layer (channel_whitelist_admin_db.set_profile_whitelist_status) already
-- writes, using the identical vocabulary.
--
-- Safe to re-run.

-- ── Audit trail ─────────────────────────────────────────────────────────────
--
-- Every status transition on either surface, append-only. This is the answer to
-- "who cleared this channel and when" — a question nothing in the stack could
-- answer before, because whitelistStatus is a single mutable column with no
-- history and claims.status is the same.
--
-- entityId is varchar, not bigint: it holds a soundtracking_user_profiles.id
-- (int) for CHANNEL and a claims.id (bigint) for CLAIM. One column, two id
-- spaces, so the type is the string both agree on.
CREATE TABLE IF NOT EXISTS whitelist_audit (
  id            bigserial    PRIMARY KEY,
  "entityType"  varchar(16)  NOT NULL,   -- CHANNEL | CLAIM
  "entityId"    varchar(64)  NOT NULL,
  "fromStatus"  varchar(32),             -- NULL on the first recorded move
  "toStatus"    varchar(32)  NOT NULL,
  note          text,                    -- required by the API on a reject
  "actorUserId" bigint,                  -- internal users.id from the session
  "actorEmail"  varchar(255),            -- snapshotted: staff accounts get deactivated
  "createdAt"   timestamptz  NOT NULL DEFAULT now()
);

-- The only read pattern: one entity's history, newest first.
CREATE INDEX IF NOT EXISTS whitelist_audit_entity_idx
  ON whitelist_audit ("entityType", "entityId", "createdAt" DESC);

-- ── Per-channel allowlist bookkeeping ───────────────────────────────────────
--
-- Marking a channel 'whitelisted' in the DB is NOT the same act as allowlisting
-- it on the platform (YouTube Content ID, Meta Rights Manager). Conflating the
-- two is exactly how a creator ends up told they are cleared while their videos
-- keep getting claimed — the complaint that prompted this dashboard.
--
-- So the platform-side act is tracked separately, and the CMS shows both. See
-- services/business-service/whitelisting/allowlist.provider.ts for the states.
CREATE TABLE IF NOT EXISTS channel_whitelist_ops (
  "profileId"         bigint       PRIMARY KEY,  -- soundtracking_user_profiles.id
  "allowlistState"    varchar(24)  NOT NULL DEFAULT 'NOT_STARTED',
  "allowlistProvider" varchar(24),               -- youtube | meta | manual
  "allowlistRef"      text,                      -- provider-side id, or the operator's note
  "allowlistError"    text,
  "allowlistAt"       timestamptz,
  "allowlistBy"       bigint,

  -- Notification de-duplication. A creator must be told once per outcome, not
  -- once per time an operator re-saves the same status.
  "notifiedStatus"    varchar(32),
  "notifiedAt"        timestamptz,

  "updatedAt"         timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS channel_whitelist_ops_state_idx
  ON channel_whitelist_ops ("allowlistState");

-- ── Per-claim notification bookkeeping ──────────────────────────────────────
--
-- Same de-dup contract as above, for the claim queue. Kept in its own table
-- rather than as columns on `claims` because NATIVE-BE owns that entity.
CREATE TABLE IF NOT EXISTS claim_ops (
  "claimId"        bigint       PRIMARY KEY,     -- claims.id
  "notifiedStatus" varchar(32),
  "notifiedAt"     timestamptz,
  "updatedAt"      timestamptz  NOT NULL DEFAULT now()
);
