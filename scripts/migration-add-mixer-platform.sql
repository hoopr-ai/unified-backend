-- Add `platform` to creator_mixer_downloads.
--
-- WHY
-- The multitrack mixer now exists on BOTH sides of the platform: NATIVE-BE
-- renders mixes for creator-web (a creator subscription entitles them) and
-- unified-backend renders them for enterprise brands (an unlimited "Hoopr
-- Originals" token allocation entitles them). Both write to THIS table.
--
-- `user_id` alone does separate them in practice — a `users` row belongs to one
-- platform, so no id is ever both — but nothing in the table SAYS so. Every
-- read would have to join `users` to find out whose mix it is, and revenue /
-- retention reporting over mixes would silently blend two products. The column
-- makes the distinction explicit and indexable.
--
-- VALUES: 'CREATOR' and 'ENTERPRISE', matching what `users.platform` actually
-- holds — verified against both databases:
--
--   sage_staging        users.platform: CREATOR=450252, STUDIO=18,
--                       ENTERPRISE=17, INTERNAL=9, SOUND_TRACKING_APP=1
--   unified-backend-prod users.platform: CREATOR=460324, ENTERPRISE=529,
--                       STUDIO=40, INTERNAL=39, SOUND_TRACKING_APP=0
--
-- NOT 'SOUND_TRACKING_APP'. The first cut of this file used that value on the
-- strength of the note in services/dto-service/constants/platform.ts, which
-- states that CREATOR is an alias folded onto a stored 'SOUND_TRACKING_APP'.
-- The data says otherwise: CREATOR is the stored value, and
-- SOUND_TRACKING_APP appears on exactly one row across both databases. This
-- file therefore also CORRECTS an earlier apply — it rewrites any
-- SOUND_TRACKING_APP row and replaces the CHECK — so it is safe to re-run
-- whether or not the first version was applied. (See the note at the bottom:
-- that stale claim has consequences beyond this table.)
--
-- BACKFILL
-- Every row that exists today was written by NATIVE-BE or migrated out of
-- hoopr's consumer mixer, so they are all CREATOR. That is also the DEFAULT,
-- which is what keeps NATIVE-BE's inserts working unchanged — its entity does
-- not know this column exists and does not need to.
--
-- Reversible: DROP COLUMN. No data is rewritten beyond the backfill.

BEGIN;

ALTER TABLE creator_mixer_downloads
  ADD COLUMN IF NOT EXISTS platform VARCHAR(64) NOT NULL DEFAULT 'CREATOR';

-- Explicit, because ADD COLUMN IF NOT EXISTS is a no-op when an earlier apply
-- already created the column with the wrong default.
ALTER TABLE creator_mixer_downloads
  ALTER COLUMN platform SET DEFAULT 'CREATOR';

-- Drop the CHECK before the backfill: if an earlier apply installed the
-- SOUND_TRACKING_APP version, the UPDATE below would violate it.
ALTER TABLE creator_mixer_downloads
  DROP CONSTRAINT IF EXISTS creator_mixdl_platform_chk;

UPDATE creator_mixer_downloads
   SET platform = 'CREATOR'
 WHERE platform IS NULL
    OR platform = 'SOUND_TRACKING_APP';

ALTER TABLE creator_mixer_downloads
  ADD CONSTRAINT creator_mixdl_platform_chk
  CHECK (platform = ANY (ARRAY['CREATOR'::varchar, 'ENTERPRISE'::varchar]));

-- The history read is "this user's mixes, newest first, on this platform".
-- idx_creator_mixdl_user_created already covers (user_id, created_at DESC);
-- this one keeps the platform-scoped listing from degrading to a filter on top
-- of it once enterprise rows are a meaningful share of the table.
CREATE INDEX IF NOT EXISTS idx_creator_mixdl_platform_user_created
  ON creator_mixer_downloads (platform, user_id, created_at DESC);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEPARATE, AND NOT FIXED HERE
--
-- `normalizePlatform` (services/dto-service/constants/platform.ts) folds
-- CREATOR onto SOUND_TRACKING_APP at every edge — request validation, query
-- params, the JWT session claim — on the premise corrected above. Against these
-- databases that turns a creator platform filter into one matching a single row
-- on sage and none on prod. Anything doing `WHERE platform = :platform` for
-- creator users is worth checking; it is out of scope for the mixer, which
-- writes the literal 'ENTERPRISE' and never routes through that helper.
-- ─────────────────────────────────────────────────────────────────────────────
