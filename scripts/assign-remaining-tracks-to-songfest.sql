-- Second pass: the tracks on the explicit Songfest list that were not already
-- moved by assign-hidden-tracks-to-songfest.sql.
--
-- That first pass moved everything hidden AND GSharp-owned. These five were on
-- the list but sat outside that rule — four belong to OTHER labels, and one is
-- neither hidden nor Universal-ISRC:
--
--   7469   Tasveerein            Merchant Records        hidden   ING642409551
--   8333   Tamasha (Skit)        Mox                     hidden   usl4q1984657
--   22342  Aisi Shaam            Universal Music India   hidden   INUM72600891
--   22347  Moh Se Bol Na Bol     Universal Music India   hidden   INUM72600949
--   1485   My Love               GSharp Media            VISIBLE  INC562015696
--
-- NAME RESOLUTION, since the list was given as titles:
--   "Moh Se Na Bol" -> "Moh Se Bol Na Bol" (22347), 1.00 trigram similarity and
--                      the only hidden Universal track near that name.
--   "Tamasha"       -> "Tamasha (Skit)" (8333), the only match.
--   "My Love"       -> 1485, the ACTIVE one. 14213 is an INACTIVE duplicate
--                      with no ISRC and was deliberately not taken.
--   "Sohneya" and "Khwaish" are NOT here — no confident match in the catalogue
--                      ("Sohnneyaa" 11115 is close but is not hidden; "Khwaish"
--                      matches nothing). Both were explicitly skipped.
--
-- ⚠ THIS CHANGES THE OWNER TYPE OF FOUR TRACKS.
-- Songfest is type 'Hoopr Originals'. Merchant Records and Mox are
-- 'Regional & Indie'; Universal Music India is 'Chartbusters'. Moving these
-- four makes them Hoopr Originals, which is a GATE, not a label:
--
--   · NATIVE-BE / creator-web serves a track when it is ACTIVE and
--     Originals-owned. Its DEPLOYED code does not test `isHidden` — that fix
--     exists but is not shipped. So from the moment this runs, these four
--     become servable there despite being hidden. That is the exact leak the
--     isHidden work was meant to close, arriving from the other direction.
--   · unified-backend's mixer will accept them (Originals-only rule).
--   · Revenue and IPRS for them now resolve through Songfest (87% share,
--     IPRS 13) instead of their own label's terms.
--
-- 1485 "My Love" carries none of that risk: GSharp Media is already
-- 'Hoopr Originals', so its gate status does not move.
--
-- REVERSIBLE: previous ownerId values are appended to the same
-- _songfest_owner_backup table the first pass created. Rollback:
--
--   UPDATE tracks t SET "ownerId" = b.old_owner_id
--     FROM _songfest_owner_backup b WHERE b.track_id = t.id;
--
-- Idempotent: keyed on explicit trackCodes, and skips any already owned solely
-- by Songfest.

BEGIN;

CREATE TABLE IF NOT EXISTS _songfest_owner_backup (
  track_id      uuid PRIMARY KEY,
  track_code    varchar,
  track_name    text,
  old_owner_id  uuid[],
  backed_up_at  timestamptz NOT NULL DEFAULT NOW()
);

INSERT INTO _songfest_owner_backup (track_id, track_code, track_name, old_owner_id)
SELECT t.id, t."trackCode", t.name, t."ownerId"
  FROM tracks t
 WHERE t."trackCode" IN ('7469', '8333', '22342', '22347', '1485')
   AND NOT (t."ownerId" = ARRAY['5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid])
ON CONFLICT (track_id) DO NOTHING;

UPDATE tracks t
   SET "ownerId" = ARRAY['5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid],
       "updatedAt" = NOW()
 WHERE t."trackCode" IN ('7469', '8333', '22342', '22347', '1485');

DO $$
DECLARE
  v_n int; BEGIN

  PERFORM 1 FROM owners WHERE id = '5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Songfest owner row is missing — run create-owner-songfest.sql first.';
  END IF;

  -- Every code that EXISTS on this database must now be Songfest-owned.
  --
  -- Not "all five": sage_staging is ~4,000 tracks behind prod and does not
  -- carry 22342 (Aisi Shaam) or 22347 (Moh Se Bol Na Bol) at all. Asserting a
  -- flat 5 made this file correct on prod and impossible on sage. What actually
  -- matters is that nothing PRESENT was missed — a code absent here will arrive
  -- already-owned whenever staging is next refreshed from prod.
  SELECT count(*) INTO v_n FROM tracks
   WHERE "trackCode" IN ('7469', '8333', '22342', '22347', '1485')
     AND NOT ("ownerId" = ARRAY['5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid]);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% listed track(s) present on this database were not moved.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM tracks
   WHERE "trackCode" IN ('7469', '8333', '22342', '22347', '1485');
  RAISE NOTICE '% of 5 listed tracks exist here and are Songfest-owned.', v_n;

  -- Every track Songfest owns must have a restore path.
  SELECT count(*) INTO v_n
    FROM tracks t
   WHERE t."ownerId" = ARRAY['5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid]
     AND NOT EXISTS (SELECT 1 FROM _songfest_owner_backup b WHERE b.track_id = t.id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% Songfest-owned track(s) have no backup row.', v_n;
  END IF;
END $$;

COMMIT;
