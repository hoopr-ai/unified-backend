import { Client } from "pg";
import { config } from "dotenv";

config();

const client = new Client({
  host: process.env.DB_HOST || "34.47.153.109",
  user: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl: { rejectUnauthorized: false },
});

async function inactivateTracksWithMissingLinks() {
  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Preview how many tracks will be affected
    const previewResult = await client.query(`
      SELECT COUNT(*) AS count
      FROM tracks
      WHERE (
        "waveformLink" IS NULL OR TRIM("waveformLink") = ''
        OR "mp3Link"    IS NULL OR TRIM("mp3Link")    = ''
      )
      AND status != 'INACTIVE';
    `);
    console.log(`\n🔍 Tracks to be set INACTIVE: ${previewResult.rows[0].count}`);

    // Update
    const updateResult = await client.query(`
      UPDATE tracks
      SET status = 'INACTIVE'
      WHERE (
        "waveformLink" IS NULL OR TRIM("waveformLink") = ''
        OR "mp3Link"    IS NULL OR TRIM("mp3Link")    = ''
      );
    `);
    console.log(`✅ Updated ${updateResult.rowCount} tracks to INACTIVE`);

    // Summary
    const summary = await client.query(`
      SELECT status, COUNT(*) AS count
      FROM tracks
      GROUP BY status
      ORDER BY status;
    `);
    console.log("\n📊 Tracks status summary:");
    summary.rows.forEach((r) => console.log(`   ${r.status ?? "NULL"}: ${r.count}`));
  } catch (err) {
    console.error("❌ Failed:", err);
  } finally {
    await client.end();
  }
}

inactivateTracksWithMissingLinks();
