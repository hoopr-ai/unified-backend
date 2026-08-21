// Move social handles from per-user rows onto the brand they actually describe.
//
// Adds instagram/youtube/facebook columns to `brands` (idempotent), then fills
// them from the existing `user_profiles` rows: the brand creator's row wins,
// otherwise the oldest member row that has an Instagram link. Brands that
// already have links are left alone.
//
// Dry-run by default — pass --commit to actually write.
//
// Usage:
//   npx tsx scripts/backfill-brand-social-links.ts
//   npx tsx scripts/backfill-brand-social-links.ts --commit
//   npx tsx scripts/backfill-brand-social-links.ts --brand=264 --commit
import "dotenv/config";
import { QueryTypes } from "sequelize";
import { connectDatabase, sequelize } from "../services/persistence-service/database";

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : undefined;
};

const onlyBrandId = arg("brand") ? Number(arg("brand")) : undefined;
const commit = process.argv.includes("--commit");

const ADD_COLUMNS = `
  ALTER TABLE brands
    ADD COLUMN IF NOT EXISTS "instagramLink" VARCHAR(500),
    ADD COLUMN IF NOT EXISTS "youtubeLink"   VARCHAR(500),
    ADD COLUMN IF NOT EXISTS "facebookLink"  VARCHAR(500)
`;

// One candidate row per brand: the creator's profile if it has links, else the
// oldest member profile that does. DISTINCT ON keeps the first row per brand.
const CANDIDATES = `
  SELECT DISTINCT ON (u."brandId")
         u."brandId"      AS brand_id,
         b.name           AS brand_name,
         u.id             AS user_id,
         u.email          AS user_email,
         p."instagramLink" AS instagram,
         p."youtubeLink"   AS youtube,
         p."facebookLink"  AS facebook
    FROM user_profiles p
    JOIN users u  ON u.id = p."userId"
    JOIN brands b ON b.id = u."brandId"
   WHERE u."brandId" IS NOT NULL
     AND p."instagramLink" IS NOT NULL
     AND ($1::bigint IS NULL OR u."brandId" = $1::bigint)
   ORDER BY u."brandId",
            (b."createdBy" = u.id) DESC,   -- brand creator first
            u.id ASC                        -- then the oldest member
`;

interface Candidate {
  brand_id: string;
  brand_name: string;
  user_id: string;
  user_email: string;
  instagram: string | null;
  youtube: string | null;
  facebook: string | null;
}

(async () => {
  await connectDatabase();

  const columns = await sequelize.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'brands' AND column_name IN ('instagramLink','youtubeLink','facebookLink')`,
    { type: QueryTypes.SELECT },
  );
  const columnsExist = columns.length === 3;

  console.log(
    `Brand social columns: ${columnsExist ? "already present" : "MISSING — will be added"}`,
  );

  if (!columnsExist) {
    if (!commit) {
      console.log(`\nDDL that will run:\n${ADD_COLUMNS.trim()}`);
      console.log(
        "\nDry run cannot preview the backfill until the columns exist. Re-run with --commit.",
      );
      process.exit(0);
    }
    await sequelize.query(ADD_COLUMNS);
    console.log("✅ Columns added to brands");
  }

  const candidates = await sequelize.query<Candidate>(CANDIDATES, {
    type: QueryTypes.SELECT,
    bind: [onlyBrandId ?? null],
  });

  const alreadySet = await sequelize.query<{ id: string }>(
    `SELECT id FROM brands WHERE "instagramLink" IS NOT NULL`,
    { type: QueryTypes.SELECT },
  );
  const skip = new Set(alreadySet.map((r) => String(r.id)));

  const plan = candidates.map((c) => ({
    brandId: c.brand_id,
    brandName: c.brand_name,
    sourceUser: c.user_email,
    instagramLink: c.instagram,
    youtubeLink: c.youtube,
    facebookLink: c.facebook,
    action: skip.has(String(c.brand_id)) ? "skip — brand already has links" : "fill",
  }));

  console.log(JSON.stringify({ mode: commit ? "COMMIT" : "DRY RUN", plan }, null, 2));

  if (!commit) {
    console.log("\nDry run only — re-run with --commit to write.");
    process.exit(0);
  }

  let filled = 0;
  for (const c of candidates) {
    if (skip.has(String(c.brand_id))) continue;
    await sequelize.query(
      `UPDATE brands
          SET "instagramLink" = $1, "youtubeLink" = $2, "facebookLink" = $3, "updatedAt" = NOW()
        WHERE id = $4`,
      { bind: [c.instagram, c.youtube, c.facebook, c.brand_id] },
    );
    filled++;
    console.log(`✅ brand ${c.brand_id} "${c.brand_name}" ← ${c.user_email}`);
  }

  console.log(`\nDone. ${filled} brand(s) filled, ${candidates.length - filled} skipped.`);
  process.exit(0);
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
