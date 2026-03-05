import { Client } from "pg";

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
};

async function migrateFiltersAddRank() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Check if column already exists
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'filters' AND column_name = 'rank';
    `);

    if (checkResult.rows.length > 0) {
      console.log("⚠️  Column 'rank' already exists in filters table. Migration already applied.");
      return;
    }

    // Add rank column
    console.log("⏳ Adding 'rank' column to filters table...");
    await client.query(`ALTER TABLE "filters" ADD COLUMN "rank" INTEGER DEFAULT NULL;`);
    console.log("✅ Column 'rank' added successfully");

    console.log("\n✅ Migration complete!");
    console.log("ℹ️  Set rank values via SQL to control ordering within each filter group.");
    console.log("   Filters with NULL rank will appear after ranked ones, sorted by name.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.end();
  }
}

migrateFiltersAddRank();
