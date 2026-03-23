import { Client } from "pg";

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
};

async function migrateAddCountryCodeToUsers() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Check if column already exists
    const checkColumnQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'countryCode';
    `;
    const checkResult = await client.query(checkColumnQuery);

    if (checkResult.rows.length > 0) {
      console.log("⚠️  Column 'countryCode' already exists. Migration already applied.");
      return;
    }

    // Add countryCode column
    const addColumnQuery = `
      ALTER TABLE users ADD COLUMN "countryCode" VARCHAR(10);
    `;
    await client.query(addColumnQuery);
    console.log("✅ Added 'countryCode' column to users table");

    // Update existing users with default country code '91' if mobile exists
    const updateQuery = `
      UPDATE users SET "countryCode" = '91' WHERE "countryCode" IS NULL AND mobile IS NOT NULL;
    `;
    const updateResult = await client.query(updateQuery);
    console.log(`✅ Updated ${updateResult.rowCount} existing users with default country code '91'`);

    console.log("🎉 Migration completed successfully");

  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await client.end();
    console.log("🔌 Disconnected from database");
  }
}

// Run migration
migrateAddCountryCodeToUsers().catch(console.error);