import { Client } from "pg";

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
};

async function migrateUserSessionsTokenText() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    const checkResult = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'user_sessions'
        AND column_name IN ('sessionToken', 'refreshToken');
    `);

    if (checkResult.rows.length === 0) {
      console.log("⚠️  Table 'user_sessions' not found. Nothing to migrate.");
      return;
    }

    for (const row of checkResult.rows) {
      if (row.data_type === "text") {
        console.log(`⚠️  Column '${row.column_name}' is already TEXT. Skipping.`);
        continue;
      }
      console.log(`⏳ Altering '${row.column_name}' (${row.data_type}(${row.character_maximum_length})) to TEXT...`);
      await client.query(`ALTER TABLE "user_sessions" ALTER COLUMN "${row.column_name}" TYPE TEXT;`);
      console.log(`✅ Column '${row.column_name}' is now TEXT`);
    }

    console.log("\n✅ Migration complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrateUserSessionsTokenText();
