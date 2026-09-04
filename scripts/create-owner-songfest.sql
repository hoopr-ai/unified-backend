-- Create the owner "Songfest" as a copy of GSharp Media.
--
-- SOURCE: owners.id = 1c12f889-2539-4b37-9efe-3884e4026e7b (ownerCode '2'),
-- the 2024 GSharp Media row — NOT D00001/25ac335e, which is a different row
-- with different terms (IPRS 0 vs 13, no licence dates). Chosen deliberately;
-- if the other one was meant, this file is the wrong source.
--
-- COPIED BY SELECT, not by literals. The two databases have drifted — on prod
-- the source row has isParent = true and subType = '', on sage isParent = false
-- and subType is NULL — so hardcoding either environment's values would make
-- Songfest match GSharp in one place and not the other. Selecting from the row
-- means Songfest is an exact copy of whatever THAT database holds, which is
-- what "same as GSharp Media" has to mean when the two differ.
--
-- OVERRIDDEN, and why each one:
--   id           fixed UUID, so both databases carry the SAME id and anything
--                referencing this owner is portable between them.
--   ownerCode    '153'. UNIQUE NOT NULL.
--
--                Two code series exist side by side. The plain numeric one runs
--                1..152 and is where the LABELS live — YRF Music '1', GSharp
--                Media '2', Universal Music India '131', Warner '144'. The
--                D000NN one (D00001..D00048) is a later series used for
--                individual artists and small studios. Songfest belongs with
--                the labels, so it takes the numeric series.
--
--                '153' on BOTH databases, not each one's own next value: the
--                series has drifted (prod is at 152, sage only at 141, and sage
--                carries test rows 140/141 that prod does not). Taking prod's
--                next and reusing it on sage — where it is also free — keeps one
--                code for one owner everywhere, which is the same reason the id
--                is pinned. It leaves 142..152 unused on sage; that series
--                already has gaps (138 on sage, 138 and 141 on prod).
--   username     'Songfest'.
--   createdAt /  NOW(). This owner is created today; inheriting GSharp's 2024
--   updatedAt    timestamps would misdate it in every report that buckets by
--                creation.
--   revenueGenerated  forced to 0 rather than copied. It is a running total of
--                money earned; a brand-new owner has earned none, and copying
--                the source's figure would credit Songfest with GSharp's
--                revenue on day one. (Both source rows read NULL today, so this
--                is currently a no-op — it is here so the file stays correct if
--                that column is ever populated.)
--   deleted      NULL. Explicit, so a soft-deleted source could never produce a
--                born-deleted copy.
--
-- Everything else — isActive, type, subType, category, status, revenueShare,
-- IPRS, isParent, licenceStart/End, remarks, metadata, usageInfo,
-- restrictedCategories — is copied verbatim.
--
-- NOTE ON `type`: the copied value is 'Hoopr Originals', which is not a label.
-- It is the gate NATIVE-BE, unified-backend and content-recommendation all use
-- to decide what is servable, and the token pack type the mixer charges
-- against. From the moment this row exists, any track assigned to Songfest is
-- treated exactly like a GSharp Original. That is the point of the request, but
-- it is a live behavioural change, not a dormant record. Owner caches are
-- 10-minute TTL, so it takes effect within ten minutes without a deploy.
--
-- Idempotent: re-running inserts nothing once the row exists.
--
-- Usage:
--   npx tsx --env-file=.env.sage scripts/create-owner-songfest.sql   <-- via run-sql.ts
--   npx tsx scripts/run-sql.ts scripts/create-owner-songfest.sql     (.env = prod)
--
-- ROLLBACK:
--   DELETE FROM owners WHERE id = '5c82779c-d5b8-44c3-9631-f9cac0091a0e';
--   -- refuse if it owns anything by then:
--   -- SELECT count(*) FROM tracks
--   --  WHERE '5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid = ANY("ownerId"::uuid[]);

BEGIN;

INSERT INTO owners (
  id, "ownerCode", username, "revenueGenerated", "licenseStart", "licenseEnd",
  "isActive", "revenueShare", remarks, metadata, deleted, "createdAt",
  "updatedAt", "IPRS", category, type, status, "subType", "usageInfo",
  "restrictedCategories", "isParent"
)
SELECT
  '5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid,
  '153',
  'Songfest',
  0,
  src."licenseStart",
  src."licenseEnd",
  src."isActive",
  src."revenueShare",
  src.remarks,
  src.metadata,
  NULL,
  NOW(),
  NOW(),
  src."IPRS",
  src.category,
  src.type,
  src.status,
  src."subType",
  src."usageInfo",
  src."restrictedCategories",
  src."isParent"
FROM owners src
WHERE src.id = '1c12f889-2539-4b37-9efe-3884e4026e7b'::uuid
ON CONFLICT (id) DO NOTHING;

-- Corrects a row created by an earlier run of this file, which used the D000NN
-- series. Harmless when the INSERT above just created the row with '153'.
UPDATE owners
   SET "ownerCode" = '153', "updatedAt" = NOW()
 WHERE id = '5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid
   AND "ownerCode" <> '153';

-- The source row must exist, or the SELECT above quietly inserts nothing and
-- the file reports success having done nothing at all.
DO $$
DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM owners
   WHERE id = '5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Songfest was not created — is the source owner % present on this database?',
      '1c12f889-2539-4b37-9efe-3884e4026e7b';
  END IF;

  SELECT count(*) INTO v_n FROM owners
   WHERE id = '5c82779c-d5b8-44c3-9631-f9cac0091a0e'::uuid AND "ownerCode" = '153';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Songfest does not carry ownerCode 153 — another row may already hold it.';
  END IF;
END $$;

COMMIT;
