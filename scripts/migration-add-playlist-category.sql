-- Playlist category — the editorial assortment a playlist belongs to.
--
-- Separate axis from playlists.type (USER / SYSTEM / CURATED / PARTNER), which
-- describes origin/ownership. Values mirror the assortment vocabulary already
-- used across the platform (rails pageName, home-banner assortment, token
-- types) so the same playlist reads consistently everywhere:
--
--   HOOPR_ORIGINALS · CHARTBUSTERS · INTERNATIONAL · REGIONAL_AND_INDIE · MIXED
--
-- MIXED is for playlists that deliberately span assortments.
--
-- Kept as VARCHAR rather than a PG enum to match how type/status/playlistType
-- are already stored on this table (the app is the source of truth for the
-- allowed values — see PlaylistCategory in playlist.enum.ts) and so adding an
-- assortment later needs no DDL.
--
-- Nullable with no backfill: existing playlists stay uncategorised until an
-- admin sets one in the CMS. Idempotent — safe to re-run.

BEGIN;

ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS category VARCHAR(255);

-- Partial index: filtering/grouping by assortment only ever targets rows that
-- have one, so the NULL majority is left out of the index.
CREATE INDEX IF NOT EXISTS idx_playlists_category
  ON playlists (category)
  WHERE category IS NOT NULL;

COMMIT;
