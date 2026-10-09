-- Read-only. What the occasion→rails migration would do to this database.
-- Run before migration-occasion-tracks-to-rails.sql to see the blast radius.

SELECT
  COUNT(*)                                                             AS occasions,
  COUNT("occasionCode")                                                AS with_code,
  COUNT(*) FILTER (WHERE length('OCCASION_' || "occasionCode") > 50)   AS code_too_long
FROM occasions;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'occasions' AND column_name = 'description'
) AS description_column_exists;

SELECT COUNT(*) AS existing_occasion_rails
FROM rails
WHERE "pageName" LIKE 'OCCASION!_%' ESCAPE '!';

-- Occasions that WOULD get a rail, and how many tracks each would carry.
SELECT
  o.id,
  o.title,
  o."occasionCode",
  COUNT(*) FILTER (WHERE t.status = 'ACTIVE' AND t."isHidden" IS NOT TRUE) AS servable,
  COUNT(*)                                                                 AS total_mapped
FROM occasions o
JOIN track_occasion_mappings m ON m."occasionId" = o.id
JOIN tracks t                  ON t.id = m."trackId"
GROUP BY o.id, o.title, o."occasionCode"
HAVING COUNT(*) FILTER (WHERE t.status = 'ACTIVE' AND t."isHidden" IS NOT TRUE) > 0
ORDER BY servable DESC;
