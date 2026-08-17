-- Backfill playlists.category from the assortment of the tracks inside it.
--
-- Rule: a playlist takes the assortment of its tracks. If every track resolves
-- to the same one it takes that value; if the tracks span more than one it
-- becomes MIXED. Playlists with no tracks (or no resolvable owner) are left
-- NULL — uncategorised, for an admin to set by hand.
--
-- Source of truth is owners.type, which already holds exactly the four
-- assortment names (verified: no other values exist). A track can carry several
-- owners (tracks."ownerId" is a UUID array), so every owner of every track
-- counts toward the playlist's distinct set.
--
--   owners.type        → playlists.category
--   'Hoopr Originals'  → HOOPR_ORIGINALS
--   'Chartbusters'     → CHARTBUSTERS
--   'International'    → INTERNATIONAL
--   'Regional & Indie' → REGIONAL_AND_INDIE
--   (more than one)    → MIXED
--
-- Only writes rows where category IS NULL, so it is safe to re-run and will
-- never clobber a value an admin has set in the CMS. Deliberately does NOT
-- touch "updatedAt" — this is a backfill, not an edit, and bumping it would
-- reshuffle anything that sorts or caches on recency.
--
-- Fully reversible: UPDATE playlists SET category = NULL;

BEGIN;

WITH track_assortment AS (
  -- One row per (playlist, owner-of-a-track-in-it). Inner joins drop tracks
  -- with no owner and owners with no type, so an unresolvable track simply
  -- doesn't vote rather than dragging the playlist to MIXED.
  SELECT tpm."playlistId" AS playlist_id,
         o.type           AS assortment
  FROM track_playlist_mappings tpm
  JOIN tracks t  ON t.id = tpm."trackId"
  JOIN LATERAL unnest(t."ownerId") AS oid ON TRUE
  JOIN owners o  ON o.id = oid AND o.deleted IS NULL
  WHERE o.type IS NOT NULL
),
resolved AS (
  SELECT playlist_id,
         CASE
           WHEN count(DISTINCT assortment) > 1 THEN 'MIXED'
           ELSE CASE min(assortment)
                  WHEN 'Hoopr Originals'  THEN 'HOOPR_ORIGINALS'
                  WHEN 'Chartbusters'     THEN 'CHARTBUSTERS'
                  WHEN 'International'    THEN 'INTERNATIONAL'
                  WHEN 'Regional & Indie' THEN 'REGIONAL_AND_INDIE'
                  -- Unrecognised owner type: leave the playlist uncategorised
                  -- rather than inventing a value.
                END
         END AS category
  FROM track_assortment
  GROUP BY 1
)
UPDATE playlists p
SET category = r.category
FROM resolved r
WHERE r.playlist_id = p.id
  AND r.category IS NOT NULL
  AND p.category IS NULL;

COMMIT;
