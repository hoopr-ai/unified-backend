import { Client } from "pg";

const DB_CONFIG = {
  // host: process.env.DB_HOST || "34.47.200.207",
  // port: parseInt(process.env.DB_PORT || "5432"),
  // user: process.env.DB_USER || "select-server-dev",
  // password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  // database: process.env.DB_NAME || "sage_staging",
  host: process.env.DB_HOST || "34.47.153.109",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  ssl: { rejectUnauthorized: false },
};

async function migrateVideoLinksAddUserBrand() {
  const client = new Client(DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Add userId column if not exists
    const checkUserId = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'video_links' AND column_name = 'userId';
    `);
    if (checkUserId.rows.length === 0) {
      await client.query(`ALTER TABLE video_links ADD COLUMN "userId" BIGINT;`);
      console.log("✅ Added column 'userId'");
    } else {
      console.log("⚠️  Column 'userId' already exists, skipping");
    }

    // Add brandId column if not exists
    const checkBrandId = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'video_links' AND column_name = 'brandId';
    `);
    if (checkBrandId.rows.length === 0) {
      await client.query(
        `ALTER TABLE video_links ADD COLUMN "brandId" BIGINT;`,
      );
      console.log("✅ Added column 'brandId'");
    } else {
      console.log("⚠️  Column 'brandId' already exists, skipping");
    }

    // Add indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_video_links_user_id ON video_links ("userId");
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_video_links_brand_id ON video_links ("brandId");
    `);
    console.log("✅ Indexes ensured");

    // Backfill userId and brandId from licenses table
    const result = await client.query(`
      UPDATE video_links vl
      SET
        "userId"  = l."userId",
        "brandId" = l."brandId"
      FROM licenses l
      WHERE vl."licenseId" = l.id
        AND (vl."userId" IS NULL OR vl."brandId" IS NULL);
    `);
    console.log(
      `✅ Backfilled ${result.rowCount} rows with userId and brandId from licenses`,
    );

    console.log("\n✅ Migration complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.end();
  }
}

migrateVideoLinksAddUserBrand();
