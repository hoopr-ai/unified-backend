-- Web Banners — the CMS-managed source for enterprise-fe's 4:1 landscape
-- carousel banners, surfaced as a BANNERS rail.
--
-- NOT the same as the existing "Home Banners" CMS (/smash/banners, Flask app):
-- those are 5:7 portrait app tiles with a TRACK/PLAYLIST/ARTIST target.
--
-- No placement/page column: a banner's page is whichever BANNERS rail it is
-- added to, and rails already carry pageName.
--
-- Idempotent: safe to re-run. Seeds the 15 slides that were hardcoded across
-- MiraContentBox + the 5 category pages, preserving their current order and
-- destinations. imageLink is seeded with the existing CDN URLs, so the
-- storefront keeps rendering the same art with no re-upload needed; replacing a
-- banner's art through the CMS overwrites it at enterprise/web/banners/<id>.<ext>.

BEGIN;

CREATE TABLE IF NOT EXISTS web_banners (
  id                BIGSERIAL PRIMARY KEY,
  "bannerCode"      VARCHAR(255) UNIQUE,
  title             VARCHAR(255) NOT NULL,
  "imageLink"       VARCHAR(1024),
  "mobileImageLink" VARCHAR(1024),
  "linkPath"        VARCHAR(1024),
  "linkParams"      JSONB,
  "isActive"        BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ
);

-- The seeded image URLs point at the existing CDN objects under
-- /web/mirasearch/backgrounds/ (hand-encoded filenames with spaces and
-- apostrophes — kept verbatim). New uploads land under /web/banners/ instead.
INSERT INTO web_banners ("bannerCode", title, "imageLink", "linkPath", "linkParams")
VALUES
  -- ── HOME (MiraContentBox) ────────────────────────────────────────────────
  ('rakhamma', 'Rakhamma',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Rakhamma.webp',
     '/tracks/20828', NULL),
  ('travel-tunes', 'Travel Tunes',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Travel%20Tunes.webp',
     '/playlists/travel', NULL),
  ('friendship-day', 'Friendship Day',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Friendship%20Day.webp',
     '/playlists/friendship-day', NULL),
  ('monsoon-splash', 'Ye Barish Ki Boondein',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Ye%20Barish%20ki%20boondein.webp',
     '/playlists/monsoon-splash', NULL),

  -- ── HOOPR_ORIGINALS ──────────────────────────────────────────────────────
  ('baarish-vibes', 'Baarish Vibes',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Baarish%20(2).webp',
     '/playlists/baarish-vibes', NULL),
  ('best-of-hoopr', 'The Best of Hoopr',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/The%20Best%20of%20Hoopr''s%20(1).webp',
     'https://smash.hoopr.ai/playlists/the-best-of-hoopr-s', NULL),

  -- ── CHARTBUSTERS (Bollywood) ─────────────────────────────────────────────
  ('cocktail-2', 'Cocktail 2',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Cocktail%202.webp',
     '/playlists/cocktail-2', NULL),
  ('coke-studio', 'Coke Studio',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Cokestudio.webp',
     '/playlists/coke-studio', NULL),
  ('arz-kiya-hai', 'Arz Kiya Hai',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/arz%20kiya%20hai2.webp',
     '/tracks/20145', NULL),

  -- ── INTERNATIONAL ────────────────────────────────────────────────────────
  ('international-artist', 'International',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/International-1.webp',
     '/artists/ecb1b6c6-e2c6-405a-9f29-61bdb5ff740f', NULL),
  ('international-label-130', 'International',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/International-2.webp',
     '/labels/130', NULL),
  ('international-chartbusters', 'International Chartbusters',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/International%20Chartbusters.webp',
     '/labels/122', NULL),

  -- ── REGIONAL_AND_INDIE ───────────────────────────────────────────────────
  ('popular-languages', 'Punjabi Tadka to Chilli South',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Punjabi%20Tadka%20to%20chilli%20South%20.webp',
     '/rails/popular-languages',
     '{"pageName":"REGIONAL_AND_INDIE","railId":"52","railType":"LANGUAGES"}'::jsonb),
  ('rath-yatra-special', 'Jai Jagannath',
     'https://cdn-prod.hooprsmash.com/enterprise/web/mirasearch/backgrounds/Jai%20Jagannath.webp',
     '/playlists/rath-yatra-special', NULL)
ON CONFLICT ("bannerCode") DO NOTHING;

COMMIT;

-- NOTE: the Sound Effects banner (HOOPR_SFX, "At An Indian Marke (1).png") is
-- deliberately NOT seeded — it opens a playlist *sheet* rather than navigating,
-- which this link model can't express, so it stays hardcoded in SoundEffects.tsx.
