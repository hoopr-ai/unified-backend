-- Move the hidden GSharp Media tracks to the Songfest owner.
--
-- WHAT
-- Every track with `isHidden` = TRUE that is currently owned by either GSharp
-- Media row has its `ownerId` REPLACED with {Songfest}. GSharp is removed; the
-- tracks end up solely owned by Songfest.
--
--   prod: 20 tracks   (17 under 1c12f889 / code '2', 3 under 25ac335e / D00001)
--   sage: 11 tracks   (all under 1c12f889)
--
-- These are the Universal-ISRC recordings (INUM7…/INUV7…) that were ingested
-- under GSharp Media and later hidden. Songfest is a copy of GSharp Media
-- (ownerCode '2') — see create-owner-songfest.sql — so it carries the same
-- type, revenue share, IPRS and licence terms.
--
-- WHAT DOES NOT CHANGE
--   · `isHidden` stays TRUE — this moves ownership, it does not unhide anything.
--   · Servability is unchanged: Songfest is also type 'Hoopr Originals', so the
--     gate in NATIVE-BE / unified-backend / content-recommendation resolves the
--     same answer it did before. These tracks stay excluded by `isHidden`, not
--     by ownership.
--   · Licences reference trackCode, not owner, so existing licences are intact.
--
-- WHAT DOES CHANGE
-- Anything that resolves terms THROUGH the owner now reads Songfest's row:
-- revenue reporting, IPRS attribution, licence PDFs (owner name), and the token
-- pack matched at licence time. Songfest's terms are identical to GSharp code
-- '2' today — but the 3 prod tracks moving off 25ac335e (D00001) came from a row
-- with IPRS 0 and no licence dates, and will now resolve IPRS 13 and the
-- 1970-epoch licence dates that row carries. That is a real change for those 3.
--
-- NOT TOUCHED: the hidden tracks owned by Universal Music India (11 on prod),
-- YRF Music, Mox and Merchant Records. Those are other labels' rights.
--
-- REVERSIBLE
-- Every previous `ownerId` is copied to `_songfest_owner_backup` before the
-- update, keyed by track id. Rollback:
--
--   UPDATE tracks t SET "ownerId" = b.old_owner_id
--     FROM _songfest_owner_backup b
--    WHERE b.track_id = t.id;
--   -- then, once satisfied:
--   -- DROP TABLE _songfest_owner_backup;
--
-- Idempotent: after it runs, no hidden track is GSharp-owned any more, so the
-- UPDATE matches nothing on a second run and the backup is not re-written.
--
-- Usage:
--   npx tsx --env-file=.env.sage scripts/run-sql.ts scripts/assign-hidden-tracks-to-songfest.sql
--   npx tsx scripts/run-sql.ts scripts/assign-hidden-tracks-to-songfest.sql    (.env = prod)

BEGIN;

CREATE TABLE IF NOT EXISTS _songfest_owner_backup (
  track_id      uuid PRIMARY KEY,
  track_code    varchar,
  track_name    text,
  old_owner_id  uuid[],
  backed_up_at  timestamptz NOT NULL DEFAULT NOW()
);

-- Snapshot first. ON CONFLICT DO NOTHING so a re-run can never overwrite a
-- genuine pre-change value with a post-change one.
INSERT INTO _songfest_owner_backup (track_id, track_code, track_name, old_owner_id)
SELECT t.id, t."trackCode", t.name, t."ownerId"
  FROM tracks t
 WHERE t."isHidden" = TRUE
   AND t."ownerId" && ARRAY[
         '1c12f889-2539-4b37-9efe-3884e4026e7b'::uuid,
         '25ac335e-3e27-43b9-a424-8150673d8744'::uuid
       ]
ON CONFLICT (track_id) DO NOTHING;

UPDATE tracks t
   SET "ownerId" = ARRAY['5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid],
       "updatedAt" = NOW()
 WHERE t."isHidden" = TRUE
   AND t."ownerId" && ARRAY[
         '1c12f889-2539-4b37-9efe-3884e4026e7b'::uuid,
         '25ac335e-3e27-43b9-a424-8150673d8744'::uuid
       ];

DO $$
DECLARE
  v_left    int;
  v_moved   int;
  v_backed  int; BEGIN

  -- Songfest must exist, or the update above would have written a dangling id.
  PERFORM 1 FROM owners WHERE id = '5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Songfest owner row is missing — run create-owner-songfest.sql first.';
  END IF;

  SELECT count(*) INTO v_left FROM tracks
   WHERE "isHidden" = TRUE
     AND "ownerId" && ARRAY['1c12f889-2539-4b37-9efe-3884e4026e7b'::uuid,
                            '25ac335e-3e27-43b9-a424-8150673d8744'::uuid];
  IF v_left <> 0 THEN
    RAISE EXCEPTION '% hidden track(s) are still GSharp-owned after the update.', v_left;
  END IF;

  SELECT count(*) INTO v_moved FROM tracks
   WHERE "ownerId" = ARRAY['5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid];
  SELECT count(*) INTO v_backed FROM _songfest_owner_backup;

  -- Every moved track must have a restore path.
  IF v_moved <> v_backed THEN
    RAISE EXCEPTION 'Songfest owns % track(s) but only % are backed up.', v_moved, v_backed;
  END IF;

  RAISE NOTICE 'Songfest now owns % track(s); % backed up.', v_moved, v_backed;
END $$;

COMMIT;
