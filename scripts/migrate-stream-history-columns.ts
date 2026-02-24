import { Client } from "pg";

const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
};

async function migrateStreamHistoryColumns() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // ── 1. Add `count` column if not exists ────────────────────────────────
    const countExists = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'user_stream_history' AND column_name = 'count';
    `);

    if (countExists.rows.length === 0) {
      await client.query(`
        ALTER TABLE user_stream_history
        ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1;
      `);
      console.log("✅ Added column: count");
    } else {
      console.log("⚠️  Column 'count' already exists, skipping.");
    }

    // ── 2. Add `lastStreamedAt` column if not exists ───────────────────────
    const lastStreamedAtExists = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'user_stream_history' AND column_name = 'lastStreamedAt';
    `);

    if (lastStreamedAtExists.rows.length === 0) {
      await client.query(`
        ALTER TABLE user_stream_history
        ADD COLUMN "lastStreamedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
      `);
      console.log("✅ Added column: lastStreamedAt");
    } else {
      console.log("⚠️  Column 'lastStreamedAt' already exists, skipping.");
    }

    // ── 3. Add unique constraint on (userId, trackCode, streamType) ────────
    const constraintExists = await client.query(`
      SELECT 1 FROM pg_constraint
      WHERE conname = 'unique_user_track_stream';
    `);

    if (constraintExists.rows.length === 0) {
      await client.query(`
        ALTER TABLE user_stream_history
        ADD CONSTRAINT unique_user_track_stream
        UNIQUE ("userId", "trackCode", "streamType");
      `);
      console.log("✅ Added unique constraint: unique_user_track_stream");
    } else {
      console.log("⚠️  Constraint 'unique_user_track_stream' already exists, skipping.");
    }

    console.log("\n✅ Migration complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.end();
  }
}

migrateStreamHistoryColumns();
