-- ─── Catalogue rights — what a token buys you, per catalogue ────────────────
--
-- Backs the "TOKENS ASSIGNED / WHAT'S INCLUDED" cards on the Smash
-- My Subscription screen, and the internal-fe CMS that edits them.
--
-- WHY A NEW TABLE
-- The screen says "85 tokens total · rights differ by catalogue", but nothing
-- in the schema held those rights:
--
--   token_assigned  is per (brandId, type) and answers HOW MANY tokens —
--                   never what they permit.
--   owners.usageInfo is per OWNER (183 of 198 owners are "Regional & Indie")
--                   and is far more granular — "Influencer collab",
--                   "TV, OTT & broadcast". It is the same vocabulary a level
--                   down; folding these ten flags into it would make 183 rows
--                   restate one catalogue-wide fact.
--
-- A catalogue is not an entity anywhere — it is the free-text string on
-- owners.type, and token_assigned.type carries the identical four values
-- (verified on prod: Chartbusters, International, Regional & Indie, Hoopr
-- Originals, matching on both sides). So the catalogue NAME is the key here,
-- deliberately: inventing a catalogues table would require rewriting both
-- existing columns to point at it.
--
-- No FK on `catalogue` for the same reason — there is no parent to reference.
-- The write path validates against DISTINCT owners.type instead, so a typo is
-- rejected at the API without pinning the value set in a constraint that a new
-- catalogue would have to be migrated past.
--
-- Safe to re-run.

BEGIN;

-- ── Defaults, one row per catalogue ─────────────────────────────────────────
--
-- `rights` is a flat jsonb object of boolean flags keyed by the vocabulary in
-- services/dto-service/catalogue-rights/catalogue-rights.dto.ts:
--
--   { "influencerCollab": true, "performanceAdsBoost": true,
--     "longFormContent": false,  "tvOttBroadcast": false, … }
--
-- jsonb rather than ten boolean columns: the list is a product decision that
-- has already changed twice, and adding the eleventh right should be one edit
-- to that constant, not a migration on two tables plus a deploy to read it.
-- Unknown keys are stripped by Joi on the way in, so the blob cannot drift into
-- a bag of typos.
CREATE TABLE IF NOT EXISTS catalogue_rights (
  "catalogue"     VARCHAR(255) PRIMARY KEY,
  "rights"        JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- users.id of the last internal editor. No FK: `users` is shared and this
  -- table must never be able to block a write there.
  "updatedById"   BIGINT       NULL,

  "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE catalogue_rights IS
  'Default rights per catalogue (= owners.type / token_assigned.type). Edited by internal-fe, read by the Smash My Subscription screen.';

-- ── Per-brand overrides ─────────────────────────────────────────────────────
--
-- PARTIAL BY DESIGN. `rights` here holds ONLY the keys this brand negotiated
-- away from the catalogue default; the read is `{...default, ...override}`.
--
-- Storing a full copy instead would look simpler and be a trap: the override
-- would freeze all ten flags at the moment it was written, so a later change to
-- the catalogue default would silently skip every brand that had ever
-- negotiated any single right. Partial rows mean a brand that negotiated
-- remixing still tracks the catalogue on the other nine.
CREATE TABLE IF NOT EXISTS brand_catalogue_rights (
  "id"            BIGSERIAL    PRIMARY KEY,

  "brandId"       BIGINT       NOT NULL REFERENCES brands ("id") ON DELETE CASCADE,
  "catalogue"     VARCHAR(255) NOT NULL,

  -- Only the overridden keys. `{}` is legal and means "no override" — it is
  -- kept rather than deleted so the note and audit trail survive.
  "rights"        JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- Why this brand is different. Shown in the CMS beside the override, because
  -- an unexplained exception is the one nobody dares remove later.
  "note"          TEXT         NULL,

  "updatedById"   BIGINT       NULL,

  "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE brand_catalogue_rights IS
  'Per-brand PARTIAL overrides of catalogue_rights. Effective rights = catalogue default merged with these keys.';

-- One override row per (brand, catalogue). This is what makes the write an
-- upsert rather than a read-modify-write with a race in the middle.
CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_catalogue_rights
  ON brand_catalogue_rights ("brandId", "catalogue");

-- The subscription screen's read: every override for one brand, in one hit.
CREATE INDEX IF NOT EXISTS idx_brand_catalogue_rights_brand
  ON brand_catalogue_rights ("brandId");

-- The CMS's read: every brand deviating from one catalogue.
CREATE INDEX IF NOT EXISTS idx_brand_catalogue_rights_catalogue
  ON brand_catalogue_rights ("catalogue");

-- ── Seed ────────────────────────────────────────────────────────────────────
--
-- Chartbusters only, and on the CURRENT ten-right vocabulary — see
-- migrate-catalogue-rights-vocabulary.sql for the swap away from the original
-- six. The other three catalogues are deliberately left unseeded: their terms
-- were never signed off against this vocabulary, and a row that reads
-- "nothing included" is at least visibly Not set in the CMS, where a guessed
-- one would look configured and be wrong.
--
-- ON CONFLICT DO NOTHING: re-running must never overwrite what ops has since
-- edited in the CMS.
INSERT INTO catalogue_rights ("catalogue", "rights") VALUES
  ('Chartbusters', '{
     "influencerCollab":      true,  "performanceAdsBoost":   true,
     "instagramPaidMedia":    true,  "sfxLayering":           true,
     "cutSegmentUsage":       true,  "longFormContent":       false,
     "tvOttBroadcast":        false, "remixing":              false,
     "brandCelebrityCollabs": false, "overlayingTwoTracks":   false }'::jsonb)
ON CONFLICT ("catalogue") DO NOTHING;

COMMIT;
