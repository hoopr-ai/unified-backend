import { Client } from "pg";

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
};

async function migrateSkuRenameColumn() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Check if column already renamed
    const checkColumnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'SKUs' AND column_name = 'trackCode';
    `;
    const checkResult = await client.query(checkColumnQuery);

    if (checkResult.rows.length > 0) {
      console.log("⚠️  Column 'trackCode' already exists. Migration already applied.");
      return;
    }

    // Check if old column exists
    const checkOldColumnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'SKUs' AND column_name = 'itemId';
    `;
    const checkOldResult = await client.query(checkOldColumnQuery);

    if (checkOldResult.rows.length === 0) {
      console.log("❌ Column 'itemId' does not exist. Cannot rename.");
      return;
    }

    // Rename column from itemId to trackCode
    console.log("⏳ Renaming column 'itemId' to 'trackCode'...");
    await client.query(`ALTER TABLE "SKUs" RENAME COLUMN "itemId" TO "trackCode";`);
    console.log("✅ Column renamed successfully: itemId -> trackCode");

    // Update the unique constraint if it exists
    console.log("⏳ Updating unique constraint...");

    // Drop old constraint if exists
    try {
      await client.query(`ALTER TABLE "SKUs" DROP CONSTRAINT IF EXISTS "unique_item";`);
      console.log("✅ Dropped old unique constraint");
    } catch (err: any) {
      console.log("⚠️  Old constraint might not exist, continuing...");
    }

    // Create new unique constraint with updated column name
    try {
      await client.query(`
        ALTER TABLE "SKUs"
        ADD CONSTRAINT "unique_sku_item"
        UNIQUE (id, "trackCode", "itemType", "sellingPrice");
      `);
      console.log("✅ Created new unique constraint");
    } catch (err: any) {
      console.log("⚠️  Unique constraint might already exist:", err.message);
    }

    console.log("\n✅ Migration complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.end();
  }
}

migrateSkuRenameColumn();
