-- Move two Universal recordings off Songfest and onto Universal Music India.
--
-- WHAT
--   20364  Intezaar (Nahi Nahi Abhi Nahi)   INUM72600360
--   20365  Gulabi Aankhein                  INUM72600565
--
-- Both are currently owned SOLELY by Songfest (153). Their `ownerId` is
-- REPLACED with {Universal Music India}; Songfest is removed.
--
-- HOW THEY GOT TO SONGFEST
-- Neither was hand-picked. assign-hidden-tracks-to-songfest.sql moved EVERY
-- track that was hidden and GSharp-owned, and these two matched that rule —
-- they were GSharp Media (ownerCode '2') before, at 2026-09-03 12:08. Their
-- INUM7 ISRCs are Universal's registrant prefix, which is the basis for saying
-- they belong to UMI rather than to a Hoopr owner.
--
-- ⚠ SCOPE IS DELIBERATELY TWO TRACKS, NOT THE WHOLE PREFIX.
-- 20 of Songfest's 25 tracks carry an INUM7 ISRC, and 8989 (IN-UM7-…) and 9240
-- (INUV7…) are Universal series too. By the ISRC argument all ~22 have the same
-- claim. Only these two were requested, so only these two move; the rest stay
-- on Songfest and remain inconsistent with them until someone rules on the set.
--
-- ⚠ THIS CHANGES THE SERVING GATE, NOT JUST THE CREDIT.
-- Songfest is type 'Hoopr Originals'; Universal Music India is 'Chartbusters'.
-- `type` is the gate NATIVE-BE, unified-backend and content-recommendation use
-- to decide what is servable, and the token pack the mixer charges against. So:
--   · these two stop being Originals — the mixer's Originals-only rule will
--     refuse them where it previously accepted them;
--   · licensing charges Chartbusters packs instead of Originals packs;
--   · revenue and IPRS resolve through Universal's row (its own share and IPRS)
--     instead of Songfest's inherited GSharp terms.
-- This is the exact reverse of what assign-remaining-tracks-to-songfest.sql did
-- for four other tracks, and it is the point of the request — but it is a live
-- behavioural change, not a bookkeeping one. Owner caches are 10-minute TTL, so
-- it lands within ten minutes with no deploy.
--
-- WHAT DOES NOT CHANGE
--   · `isHidden` stays TRUE on both — this moves ownership, it does not unhide.
--     Because they stay hidden, the gate change above is latent until they are
--     unhidden; it is not latent in NATIVE-BE, whose deployed code does not
--     test isHidden (see assign-remaining-tracks-to-songfest.sql) — but that
--     cuts in our favour here, since leaving Originals makes them LESS servable.
--   · Licences reference trackCode, not owner, so existing licences are intact.
--   · status stays ACTIVE.
--
-- ONLY ON PROD IN PRACTICE: sage_staging carries neither trackCode (it is
-- ~4,000 tracks behind), so this is a verified no-op there rather than an
-- error. Same tolerance as assign-remaining-tracks-to-songfest.sql.
--
-- REVERSIBLE. Previous ownerId values go to _umi_owner_backup — a SEPARATE
-- table from _songfest_owner_backup on purpose: that one still holds
-- {GSharp Media} for these two track ids, and its documented rollback would
-- send them to GSharp, not back to Songfest. Rollback for THIS file:
--
--   UPDATE tracks t SET "ownerId" = b.old_owner_id
--     FROM _umi_owner_backup b
--    WHERE b.track_id = t.id;
--   -- then, once satisfied:
--   -- DROP TABLE _umi_owner_backup;
--
-- Idempotent: after it runs neither track is Songfest-owned, so the UPDATE
-- matches nothing on a second run and the backup is not re-written.
--
-- Usage:
--   npx tsx scripts/run-sql.ts scripts/move-gulabi-intezaar-to-umi.sql   (.env = prod)
--   npx tsx --env-file=.env.sage scripts/run-sql.ts scripts/move-gulabi-intezaar-to-umi.sql

BEGIN;

CREATE TABLE IF NOT EXISTS _umi_owner_backup (
  track_id      uuid PRIMARY KEY,
  track_code    varchar,
  track_name    text,
  old_owner_id  uuid[],
  backed_up_at  timestamptz NOT NULL DEFAULT NOW()
);

-- Snapshot first. ON CONFLICT DO NOTHING so a re-run can never overwrite a
-- genuine pre-change value with a post-change one.
INSERT INTO _umi_owner_backup (track_id, track_code, track_name, old_owner_id)
SELECT t.id, t."trackCode", t.name, t."ownerId"
  FROM tracks t
 WHERE t."trackCode" IN ('20364', '20365')
   AND NOT (t."ownerId" = ARRAY['cc934ed7-fcf6-4e76-acb7-327564c3c05d'::uuid])
ON CONFLICT (track_id) DO NOTHING;

UPDATE tracks t
   SET "ownerId"   = ARRAY['cc934ed7-fcf6-4e76-acb7-327564c3c05d'::uuid],
       "updatedAt" = NOW()
 WHERE t."trackCode" IN ('20364', '20365');

DO $$
DECLARE
  v_n int; BEGIN

  -- UMI must exist, or the update above would have written a dangling id.
  PERFORM 1 FROM owners WHERE id = 'cc934ed7-fcf6-4e76-acb7-327564c3c05d'::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Universal Music India owner row is missing on this database.';
  END IF;

  -- Every listed code that EXISTS here must now be UMI-owned. Not "all two":
  -- staging carries neither, and asserting a flat 2 would make this file
  -- correct on prod and impossible on sage.
  SELECT count(*) INTO v_n FROM tracks
   WHERE "trackCode" IN ('20364', '20365')
     AND NOT ("ownerId" = ARRAY['cc934ed7-fcf6-4e76-acb7-327564c3c05d'::uuid]);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% listed track(s) present on this database were not moved.', v_n;
  END IF;

  -- Every track this file moved must have a restore path.
  SELECT count(*) INTO v_n
    FROM tracks t
   WHERE t."trackCode" IN ('20364', '20365')
     AND NOT EXISTS (SELECT 1 FROM _umi_owner_backup b WHERE b.track_id = t.id);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '% moved track(s) have no backup row.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM tracks WHERE "trackCode" IN ('20364', '20365');
  RAISE NOTICE '% of 2 listed tracks exist here and are Universal Music India-owned.', v_n;
END $$;

COMMIT;
