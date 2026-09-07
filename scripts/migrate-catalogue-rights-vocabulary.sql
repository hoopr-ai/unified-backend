-- ─── Catalogue rights — vocabulary swap (6 flags → 10) ──────────────────────
--
-- Replaces the rights vocabulary seeded by create-catalogue-rights-tables.sql
-- with the ten usage terms the track page already speaks. The old six were
-- plan-level features ("Unlimited downloads", "Worldwide perpetuity"); these
-- ten are usage rights at the same granularity as owners.usageInfo, which is
-- what "what does my token permit" actually means on the card.
--
--   dropped: unlimitedDownloads, worldwidePerpetuity, channelClearance,
--            brandedContent, socialOrganic, audiobooksPodcasts
--   added:   influencerCollab, performanceAdsBoost, instagramPaidMedia,
--            sfxLayering, cutSegmentUsage, longFormContent, tvOttBroadcast,
--            remixing, brandCelebrityCollabs, overlayingTwoTracks
--
-- No DDL — the flags live in a jsonb blob for exactly this reason. What this
-- script does is rewrite the VALUES, because normalizeCatalogueRights() drops
-- keys outside CATALOGUE_RIGHT_DEFS: the moment the code deploys, any row still
-- holding the old six reads as ALL TEN FALSE.
--
-- DEPLOY ORDER MATTERS. Run this in the same window as the deploy — a row left
-- on the old vocabulary does not error, it silently reports "nothing included",
-- and the track page turns those ten false flags into ten restrictedCategories
-- rows that replace the owner's own usageInfo blob.
--
-- Safe to re-run.

BEGIN;

-- ── Chartbusters ───────────────────────────────────────────────────────────
-- Signed-off values. Unconditional UPDATE, not ON CONFLICT DO NOTHING: the row
-- already exists from the original seed and must be replaced, not preserved.
INSERT INTO catalogue_rights ("catalogue", "rights") VALUES
  ('Chartbusters', '{
     "influencerCollab":      true,  "performanceAdsBoost":   true,
     "instagramPaidMedia":    true,  "sfxLayering":           true,
     "cutSegmentUsage":       true,  "longFormContent":       false,
     "tvOttBroadcast":        false, "remixing":              false,
     "brandCelebrityCollabs": false, "overlayingTwoTracks":   false }'::jsonb)
ON CONFLICT ("catalogue") DO UPDATE SET "rights" = EXCLUDED."rights",
                                        "updatedAt" = NOW();

-- ── International / Regional & Indie / Hoopr Originals ─────────────────────
--
-- NOT WRITTEN. These three still hold the old six keys and will read as all
-- ten false until someone with the commercial terms fills them in. They were
-- deliberately not guessed: the old vocabulary does not map onto the new one
-- (nothing in the ten corresponds to "Worldwide perpetuity" or "Channel
-- clearance"), so any mapping would be invented licensing terms.
--
-- Fill the values in and uncomment, or set them in the CMS at
-- /music/catalogue-rights — same effect, and it records updatedAt.
--
-- INSERT INTO catalogue_rights ("catalogue", "rights") VALUES
--   ('International', '{
--      "influencerCollab":      null, "performanceAdsBoost":   null,
--      "instagramPaidMedia":    null, "sfxLayering":           null,
--      "cutSegmentUsage":       null, "longFormContent":       null,
--      "tvOttBroadcast":        null, "remixing":              null,
--      "brandCelebrityCollabs": null, "overlayingTwoTracks":   null }'::jsonb),
--   ('Regional & Indie', '{ … }'::jsonb),
--   ('Hoopr Originals',  '{ … }'::jsonb)
-- ON CONFLICT ("catalogue") DO UPDATE SET "rights" = EXCLUDED."rights",
--                                         "updatedAt" = NOW();

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
--
-- Any catalogue listed here is still on the old vocabulary and is currently
-- serving "nothing included" to every brand holding its tokens.
SELECT "catalogue",
       ("rights" ?& ARRAY['influencerCollab','performanceAdsBoost','instagramPaidMedia',
                          'sfxLayering','cutSegmentUsage','longFormContent',
                          'tvOttBroadcast','remixing','brandCelebrityCollabs',
                          'overlayingTwoTracks']) AS on_new_vocabulary,
       "updatedAt"
  FROM catalogue_rights
 ORDER BY on_new_vocabulary, "catalogue";

-- Brand overrides are PARTIAL blobs and carry the old keys too. They do not
-- break — normalizePartialCatalogueRights drops the unknown keys, so the brand
-- silently falls back to the catalogue default — but the CMS keeps counting the
-- row, so a catalogue can read "3 brands" while showing no deviation at all.
-- Listed, not deleted: a negotiated term is not something a migration should
-- throw away on its own.
SELECT "catalogue", "brandId", "rights", "note", "updatedAt"
  FROM brand_catalogue_rights
 WHERE NOT ("rights" ?| ARRAY['influencerCollab','performanceAdsBoost','instagramPaidMedia',
                              'sfxLayering','cutSegmentUsage','longFormContent',
                              'tvOttBroadcast','remixing','brandCelebrityCollabs',
                              'overlayingTwoTracks'])
 ORDER BY "catalogue", "brandId";
