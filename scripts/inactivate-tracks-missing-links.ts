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

  // host: "34.47.200.207",
  // port: 5432,
  // user: "select-server-dev",
  // password: "hO82GcLotttB5bLyoeG1",
  // database: "sage_staging",
});

async function inactivateTracksWithMissingLinks() {
  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Preview: tracks to be set ACTIVE (have both links but not yet ACTIVE)
    const previewActive = await client.query(`
      SELECT COUNT(*) AS count
      FROM tracks
      WHERE "waveformLink" IS NOT NULL AND TRIM("waveformLink") != ''
        AND "mp3Link"    IS NOT NULL AND TRIM("mp3Link")    != ''
        AND status != 'ACTIVE';
    `);
    console.log(`\n🔍 Tracks to be set ACTIVE: ${previewActive.rows[0].count}`);

    // Preview: tracks to be set INACTIVE (missing either link)
    const previewInactive = await client.query(`
      SELECT COUNT(*) AS count
      FROM tracks
      WHERE (
        "waveformLink" IS NULL OR TRIM("waveformLink") = ''
        OR "mp3Link"    IS NULL OR TRIM("mp3Link")    = ''
      )
      AND status != 'INACTIVE';
    `);
    console.log(
      `🔍 Tracks to be set INACTIVE: ${previewInactive.rows[0].count}`,
    );

    // Step 1: Activate tracks that have both valid links
    const activateResult = await client.query(`
      UPDATE tracks
      SET status = 'ACTIVE'
      WHERE "waveformLink" IS NOT NULL AND TRIM("waveformLink") != ''
        AND "mp3Link"    IS NOT NULL AND TRIM("mp3Link")    != ''
        AND status != 'ACTIVE';
    `);
    console.log(`\n✅ Set ${activateResult.rowCount} tracks to ACTIVE`);

    // Step 2: Inactivate tracks missing either link
    const updateResult = await client.query(`
      UPDATE tracks
      SET status = 'INACTIVE'
      WHERE (
        "waveformLink" IS NULL OR TRIM("waveformLink") = ''
        OR "mp3Link"    IS NULL OR TRIM("mp3Link")    = ''
      );
    `);
    console.log(`✅ Set ${updateResult.rowCount} tracks to INACTIVE`);

    // Summary
    const summary = await client.query(`
      SELECT status, COUNT(*) AS count
      FROM tracks
      GROUP BY status
      ORDER BY status;
    `);
    console.log("\n📊 Tracks status summary:");
    summary.rows.forEach((r) =>
      console.log(`   ${r.status ?? "NULL"}: ${r.count}`),
    );
  } catch (err) {
    console.error("❌ Failed:", err);
  } finally {
    await client.end();
  }
}

inactivateTracksWithMissingLinks();
