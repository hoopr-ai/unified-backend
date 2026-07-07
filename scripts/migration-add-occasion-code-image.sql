-- Adds occasionCode + imageLink to the occasions table, then backfills
-- occasionCode for existing rows (slugified title, disambiguated on
-- collision with a numeric suffix). Safe to re-run: column adds are
-- IF NOT EXISTS and the backfill only touches rows where occasionCode IS NULL.

BEGIN;

ALTER TABLE occasions ADD COLUMN IF NOT EXISTS "occasionCode" VARCHAR(255) UNIQUE;
ALTER TABLE occasions ADD COLUMN IF NOT EXISTS "imageLink" VARCHAR(1024);

WITH base AS (
  SELECT
    id,
    regexp_replace(
      regexp_replace(lower(trim(title)), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ) AS slug
  FROM occasions
  WHERE "occasionCode" IS NULL
),
ranked AS (
  SELECT
    id,
    slug,
    ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
  FROM base
)
UPDATE occasions o
SET "occasionCode" = CASE WHEN r.rn = 1 THEN r.slug ELSE r.slug || '-' || r.rn END
FROM ranked r
WHERE o.id = r.id;

COMMIT;
