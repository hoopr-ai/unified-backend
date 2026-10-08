-- Adds the editorial `description` blurb to the occasions table.
--
-- Shown under the occasion's hero on the enterprise storefront, written by the
-- music team in the internal CMS. TEXT rather than a capped VARCHAR because it
-- is prose and nothing downstream truncates it.
--
-- Safe to re-run: the column add is IF NOT EXISTS and nothing is backfilled
-- (an unwritten blurb is legitimately NULL — the storefront omits the block).

BEGIN;

ALTER TABLE occasions ADD COLUMN IF NOT EXISTS "description" TEXT;

COMMIT;
