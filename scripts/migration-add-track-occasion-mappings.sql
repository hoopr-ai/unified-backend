-- Creates the CMS-managed occasion<->track mapping table. Independent of the
-- legacy keyword-tagging system (occasions -> keywords -> track_keyword_mappings)
-- which GET /occasions/:id/tracks also reads from. Mirrors track_playlist_mappings.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS track_occasion_mappings (
  id UUID PRIMARY KEY,
  "occasionId" BIGINT,
  "trackId" UUID,
  rank INTEGER,
  CONSTRAINT track_occasion_mappings_occasionId_trackId_key UNIQUE ("occasionId", "trackId")
);

COMMIT;
