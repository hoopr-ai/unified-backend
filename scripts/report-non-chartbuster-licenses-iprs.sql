-- Report: NON-chartbuster, NON-hoopr licenses by track owner with amount + IPRS share
-- Owners limited to "International" and "Regional & Indie" (excludes Chartbusters & Hoopr Originals).
-- Excludes internal brands 20 and 24. Only licenses that have at least one video link.
--
-- amount      = licenses.price when present & > 0, else per-token price from the
--               pack: pricePerPack / totalAssignedToken * tokenCost
-- iprs_share  = fixed 13% of amount
-- iprs_percentage = owners."IPRS" (informational; 0 or 13)
--
-- Multi-valued credits (composer/lyricist/singer/publisher/song link) are
-- collapsed into a single comma-separated string per row via string_agg.

WITH license_owner AS (
  SELECT
    l.id                                AS license_id,
    l."trackCode"                       AS "trackCode",
    l."tokenCost"                       AS "tokenCost",
    l."userId"                          AS "userId",
    l."brandId"                         AS "brandId",
    b.name                              AS brand_name,
    l."licensedAt"                      AS "licensedAt",
    t.id                                AS track_id,
    t.name                              AS song_title,
    t."ISRC"                            AS isrc,
    t."publisherId"                     AS publisher_ids,
    o.id                                AS owner_id,
    o."ownerCode"                       AS "ownerCode",
    o.username                          AS owner_name,
    o.type                              AS owner_type,
    o."IPRS"                            AS iprs_percentage,
    l.price                             AS license_price,
    ta."pricePerPack"                   AS price_per_pack,
    ta."totalAssignedToken"             AS total_assigned_token
  FROM licenses l
  -- a track can have several owners; explode the owner array and join each
  JOIN tracks  t ON t."trackCode" = l."trackCode"
  JOIN owners  o ON o.id = ANY(t."ownerId")
  -- pack the license was bought from, for the price fallback
  LEFT JOIN token_assigned ta ON ta.id = l."tokenId"
  LEFT JOIN brands b ON b.id = l."brandId"
  WHERE o.deleted IS NULL
    -- NON chartbuster, NON hoopr -> only International & Regional & Indie
    AND LOWER(o.type) IN ('international', 'regional & indie')
    -- exclude internal brands
    AND (l."brandId" IS NULL OR l."brandId" NOT IN (20, 24))
    -- only licenses that have at least one video link
    AND EXISTS (
      SELECT 1 FROM video_links vl WHERE vl."licenseId" = l.id
    )
)
SELECT
  lo.license_id,
  lo."trackCode",
  lo."tokenCost",
  lo."userId",
  lo."brandId",
  lo.brand_name                         AS "Brand Name",
  lo."licensedAt"                       AS "License Date",
  lo.owner_id,
  lo."ownerCode",
  lo.owner_name                         AS "Owner Name",
  lo.owner_type,
  lo.iprs_percentage,
  lo.song_title                         AS "Song Title",
  lo.isrc                               AS "ISRC",
  -- credits from track_artist_mappings, comma-joined per role
  (SELECT string_agg(DISTINCT a.name, ', ')
     FROM track_artist_mappings tam
     JOIN artists a ON a.id = tam."artistId"
    WHERE tam."trackId" = lo.track_id AND tam.role = 'COMPOSER')   AS "Composer",
  (SELECT string_agg(DISTINCT a.name, ', ')
     FROM track_artist_mappings tam
     JOIN artists a ON a.id = tam."artistId"
    WHERE tam."trackId" = lo.track_id AND tam.role = 'LYRICIST')   AS "Lyricist",
  (SELECT string_agg(DISTINCT a.name, ', ')
     FROM track_artist_mappings tam
     JOIN artists a ON a.id = tam."artistId"
    WHERE tam."trackId" = lo.track_id AND tam.role = 'SINGER')     AS "Singer",
  -- publisher(s) resolved from tracks.publisherId (owner UUIDs)
  (SELECT string_agg(DISTINCT COALESCE(po.username, po."ownerCode"), ', ')
     FROM owners po
    WHERE po.id = ANY(lo.publisher_ids))                          AS "Publisher",
  -- smash track page, built from the track code
  'https://smash.hoopr.ai/tracks/' || lo."trackCode"             AS "Song Link",
  amount,
  ROUND(amount * 0.13, 2) AS iprs_share          -- IPRS fixed at 13% of amount
FROM (
  SELECT
    inner_lo.*,
    -- price if it exists and > 0, else derive per-token price from the pack
    ROUND(
      CASE
        WHEN inner_lo.license_price IS NOT NULL AND inner_lo.license_price > 0
          THEN inner_lo.license_price
        ELSE COALESCE(inner_lo.price_per_pack, 0)
             / NULLIF(inner_lo.total_assigned_token, 0)
             * NULLIF(inner_lo."tokenCost", 0)
      END
    , 2) AS amount
  FROM license_owner inner_lo
) lo
ORDER BY lo."licensedAt" DESC;
