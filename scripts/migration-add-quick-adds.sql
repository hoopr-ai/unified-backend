-- Quick Add tiles — the CMS-managed source for the storefront's "quick search"
-- shortcut grid, surfaced as a QUICK_ADDS rail.
--
-- Idempotent: safe to re-run. Seeds the 8 tiles that were previously hardcoded
-- in enterprise-fe/src/components/custom/quickSearchItems.ts. imageLink is left
-- NULL — re-upload each tile's artwork through the CMS, which writes to
-- enterprise/web/quick-search/<id>.<ext> (the old objects are name-keyed, e.g.
-- "Best of Instrumental.png", so they are not reused).

BEGIN;

CREATE TABLE IF NOT EXISTS quick_adds (
  id            BIGSERIAL PRIMARY KEY,
  "quickAddCode" VARCHAR(255) UNIQUE,
  label         VARCHAR(255) NOT NULL,
  "imageLink"   VARCHAR(1024),
  "linkPath"    VARCHAR(512),
  "linkParams"  JSONB,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ
);

INSERT INTO quick_adds ("quickAddCode", label, "linkPath", "linkParams")
VALUES
  ('playlists',            'Playlists',            '/hoopr-native-playlists', NULL),
  ('genres',               'Genres',               '/genres',                 NULL),
  ('sound-effects',        'Sound Effects',        '/sound-effects',          NULL),
  ('best-of-instrumental', 'Best of Instrumental', '/rails/best-of-instrumental-tracks',
      '{"pageName":"HOOPR_ORIGINALS","railId":"61"}'::jsonb),
  ('moods',                'Moods',                '/moods',                  NULL),
  ('languages',            'Languages',            '/languages',              NULL),
  ('vocal-exclusives',     'Vocal Exclusives',     '/rails/vocal-exclusive',
      '{"pageName":"HOOPR_ORIGINALS","railId":"156"}'::jsonb),
  ('minimalistic',         'Minimalistic',         '/rails/minimalistic',
      '{"pageName":"HOOPR_ORIGINALS","railId":"185"}'::jsonb)
ON CONFLICT ("quickAddCode") DO NOTHING;

COMMIT;
