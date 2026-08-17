-- artists."nativeArtist" — is this artist part of the Creator (native) platform?
--
-- sequelize.sync() runs create-only (force:false, alter:false), so it creates
-- missing TABLES but never adds a column to an existing one. This ALTER is
-- therefore required on every environment, DB_SYNC or not. Idempotent.
--
-- The column is DERIVED, not authored: it mirrors "is the PRIMARY credit on at
-- least one ACTIVE, non-SFX Hoopr Originals track". Adding it defaults every
-- row to false; run the backfill immediately after:
--
--   npx ts-node scripts/backfill-native-artist-flag.ts
--
-- or hit POST /admin/artists/recompute-native as an internal ADMIN.

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS "nativeArtist" BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: every query on this column asks for the true rows (a few
-- hundred artists out of the whole catalogue), so indexing the false side
-- would be dead weight.
CREATE INDEX IF NOT EXISTS artists_native_artist_idx
  ON artists ("nativeArtist")
  WHERE "nativeArtist" = TRUE;

-- ---------------------------------------------------------------------------
-- What keeps the nightly recompute cheap as the catalogue grows.
--
-- track_artist_mappings' primary key is (id, artistId, trackId, role) — it
-- leads with `id`, so nothing answers "the credits of these artists" and the
-- recompute would hash the whole mapping table.
--
-- Staging already had this index; prod had only the PK. The name below is
-- staging's, deliberately: IF NOT EXISTS matches on NAME, not on definition, so
-- any other name here builds a SECOND index on the same column wherever one
-- already exists. (That is exactly what happened on the first staging run, and
-- the duplicate had to be dropped.)
--
-- CONCURRENTLY cannot run inside a transaction — execute this statement on its
-- own, not in a BEGIN/COMMIT block with the ALTER above.
-- ---------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_track_artist_mappings_artistid
  ON track_artist_mappings ("artistId");
