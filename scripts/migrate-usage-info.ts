import { Client } from "pg";

// ============ TARGET DATABASE ============
const DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: 5432,
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
  ssl: { rejectUnauthorized: false },
};

// Default usageInfo template based on your UI
const DEFAULT_USAGE_INFO = {
  clearanceSummary: [
    "Usage type, Short-form video, no paid promotion",
    "Max usage time, 12 months, From purchase",
    "Max video length, 60 seconds, Per video",
    "Uploads limit, Up to 3, Platforms",
  ],
  allowedPlatforms: ["Instagram", "Facebook", "YouTube Shorts"],
  allowed: [
    "Influencer collab",
    "Performance ads & boost",
    "Instagram paid media",
    "SFX layering",
    "Cut / segment usage",
    "Landscape video format",
  ],
  notAllowed: [
    "Long-form content",
    "TV, OTT & broadcast",
    "Remixing",
    "Brand collaborations",
    "Celebrity collabs",
    "Overlaying two tracks",
  ],
  addYourLinksForClearance:
    "After publishing, add your video links under My Downloads → Add Links. Only submitted links are legally cleared. Your license covers content published during your active subscription period.",
};

async function migrateUsageInfo() {
  const client = new Client(DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Find owners with old array-format usageInfo or null usageInfo
    const { rows: owners } = await client.query(`
      SELECT id, "ownerCode", username, "usageInfo"
      FROM owners
      WHERE "usageInfo" IS NULL
         OR jsonb_typeof("usageInfo") = 'array'
         OR "usageInfo" = '{}'::jsonb
    `);

    console.log(`📦 Found ${owners.length} owners to migrate`);

    if (owners.length === 0) {
      console.log("✅ No owners need migration");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const owner of owners) {
      try {
        await client.query(
          `UPDATE owners SET "usageInfo" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [JSON.stringify(DEFAULT_USAGE_INFO), owner.id],
        );
        successCount++;
        console.log(
          `✅ Updated owner: ${owner.ownerCode} (${owner.username || "no username"})`,
        );
      } catch (err: any) {
        errorCount++;
        console.error(`❌ Error updating owner ${owner.id}:`, err.message);
      }
    }

    console.log(
      `\n✅ Migration complete: ${successCount} succeeded, ${errorCount} failed`,
    );
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.end();
  }
}

migrateUsageInfo();
