-- Migrates the retired "attach tracks to an occasion" flow onto rails.
--
-- BACKGROUND
-- The occasion detail page used to be a flat 40-per-page track grid fed by
-- track_occasion_mappings, which the music team filled from the CMS. That page
-- is now hero + CMS-curated rails, exactly like a label page: each occasion
-- owns the page key OCCASION_<occasionCode> and the team authors rails against
-- it (see OCCASION_PAGE_KEY_PREFIX in services/dto-service/rail/rail.enum.ts).
--
-- WHAT THIS DOES
-- Every occasion that already has curated tracks gets one TRACKS rail on its
-- own page, holding those tracks in the admin-chosen order, so no occasion goes
-- from "has music" to empty on the day the new page ships. The team is then
-- free to rename it, reorder it, split it, or add more rails beside it.
--
-- Occasions with no curated tracks get nothing — an empty page is the correct
-- starting point for them, and an empty rail would just be litter to delete.
--
-- Only servable tracks are carried over (the same ACTIVE / not-isHidden rule
-- isTrackVisible applies on read, minus the Songfest exemption which no
-- occasion was curated against). Dead codes in the old mappings were invisible
-- on the old page too, so bringing them across would make the rail look fuller
-- than it renders.
--
-- Safe to re-run: step 1 skips occasions whose rail already exists, step 2
-- skips rails that already have items, so re-running will not overwrite or
-- duplicate anything the team has since edited. The one exception: a migrated
-- rail the team emptied completely would be refilled by a re-run, because an
-- empty rail is indistinguishable from one step 2 never reached. Delete such a
-- rail rather than emptying it.

BEGIN;

-- ─── 1. One TRACKS rail per occasion that has curated tracks ────────────────
--
-- `key` is the same on every occasion page on purpose: the rails unique index
-- is (key, brandId, pageName), and each occasion is its own pageName, so one
-- shared key stays unique while making these rails obvious as a cohort.
--
-- The length guard is the one case this migration silently skips: a page key
-- must fit rails.pageName VARCHAR(50), so an occasionCode over 41 characters
-- cannot address its own rails. The report at the bottom names any such row —
-- none exist today, and occasion codes are capped at generation time now.
INSERT INTO rails (
  "key", "title", "type", "pageName", "sourceType",
  "order", "isVisible", "createdAt", "updatedAt"
)
SELECT
  'occasion-tracks',
  'Curated tracks',
  'TRACKS',
  'OCCASION_' || o."occasionCode",
  'MANUAL',
  0,
  TRUE,
  NOW(),
  NOW()
FROM occasions o
WHERE o."occasionCode" IS NOT NULL
  AND length('OCCASION_' || o."occasionCode") <= 50
  AND EXISTS (
    SELECT 1
    FROM track_occasion_mappings m
    JOIN tracks t ON t.id = m."trackId"
    WHERE m."occasionId" = o.id
      AND t.status = 'ACTIVE'
      AND t."isHidden" IS NOT TRUE
  )
  AND NOT EXISTS (
    SELECT 1 FROM rails r
    WHERE r."key" = 'occasion-tracks'
      AND r."pageName" = 'OCCASION_' || o."occasionCode"
      AND r."brandId" IS NULL
  );

-- ─── 2. Fill each new rail, preserving the admin's order ────────────────────
--
-- `order` is re-derived as a dense 0-based sequence from the old `rank` rather
-- than copied: ranks could have gaps once a dead track was dropped above, and
-- rail items are expected to be contiguous. Ties (and NULL ranks on legacy
-- rows) fall back to trackCode so the result is deterministic.
INSERT INTO rail_items (
  "railId", "itemType", "itemCode", "order", "isLocked", "createdAt", "updatedAt"
)
SELECT
  src."railId",
  'TRACK',
  src."trackCode",
  ROW_NUMBER() OVER (
    PARTITION BY src."railId"
    ORDER BY src.rank NULLS LAST, src."trackCode"
  ) - 1,
  FALSE,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT
    r.id AS "railId",
    t."trackCode",
    m.rank
  FROM rails r
  JOIN occasions o
    ON o."occasionCode" IS NOT NULL
   AND r."pageName" = 'OCCASION_' || o."occasionCode"
  JOIN track_occasion_mappings m ON m."occasionId" = o.id
  JOIN tracks t ON t.id = m."trackId"
  WHERE r."key" = 'occasion-tracks'
    AND r."brandId" IS NULL
    AND t.status = 'ACTIVE'
    AND t."isHidden" IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM rail_items ri WHERE ri."railId" = r.id
    )
) src;

COMMIT;

-- ─── Report ─────────────────────────────────────────────────────────────────

-- What was built, per occasion.
SELECT
  o.id        AS occasion_id,
  o.title     AS occasion,
  r."pageName" AS page_key,
  COUNT(ri.id) AS tracks
FROM occasions o
JOIN rails r
  ON r."pageName" = 'OCCASION_' || o."occasionCode"
 AND r."key" = 'occasion-tracks'
LEFT JOIN rail_items ri ON ri."railId" = r.id
GROUP BY o.id, o.title, r."pageName"
ORDER BY o.id;

-- Occasions left without a rail, and why. Expected: everything whose curated
-- list was empty. Anything reported as 'occasionCode too long for a page key'
-- or 'no occasionCode' needs a hand fix before its page can hold rails.
SELECT
  o.id    AS occasion_id,
  o.title AS occasion,
  CASE
    WHEN o."occasionCode" IS NULL THEN 'no occasionCode'
    WHEN length('OCCASION_' || o."occasionCode") > 50
      THEN 'occasionCode too long for a page key'
    ELSE 'no servable curated tracks'
  END AS reason
FROM occasions o
WHERE NOT EXISTS (
  SELECT 1 FROM rails r
  WHERE r."key" = 'occasion-tracks'
    AND o."occasionCode" IS NOT NULL
    AND r."pageName" = 'OCCASION_' || o."occasionCode"
)
ORDER BY o.id;
