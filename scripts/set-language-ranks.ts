import { Client } from "pg";

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  // host: process.env.DB_HOST || "34.47.200.207",
  // port: parseInt(process.env.DB_PORT || "5432"),
  // user: process.env.DB_USER || "select-server-dev",
  // password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  // database: process.env.DB_NAME || "sage_staging",

  host: process.env.DB_HOST || "34.47.153.109",
  user: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl: { rejectUnauthorized: false },
};

const LANGUAGE_RANKS: { name: string; rank: number }[] = [
  { name: "Hindi", rank: 1 },
  { name: "Bhojpuri", rank: 2 },
  { name: "Bangla", rank: 3 },
  { name: "Tamil", rank: 4 },
  { name: "English", rank: 5 },
  { name: "Telugu", rank: 6 },
  { name: "Marathi", rank: 7 },
  { name: "Punjabi", rank: 8 },
  { name: "Gujarati", rank: 9 },
  { name: "Malayalam", rank: 10 },
  { name: "Odia", rank: 11 },
  { name: "Kannada", rank: 12 },
  { name: "Assamese", rank: 13 },
  { name: "Marwadi", rank: 14 },
  { name: "Urdu", rank: 15 },
  { name: "Sanskrit", rank: 16 },
  { name: "Rajasthani", rank: 17 },
  { name: "Haryanvi", rank: 18 },
  { name: "Chattisgarhi", rank: 19 },
  { name: "Kumaoni", rank: 20 },
  { name: "Kashmiri", rank: 21 },
  { name: "Sinhala", rank: 22 },
];

async function setLanguageRanks() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    let updated = 0;
    let notFound = 0;

    for (const { name, rank } of LANGUAGE_RANKS) {
      const result = await client.query(
        `UPDATE "filters" SET "rank" = $1 WHERE "name" = $2 AND "type" = 'language' RETURNING "id", "name"`,
        [rank, name],
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(`  ✅ [${rank}] ${name}`);
        updated++;
      } else {
        console.warn(`  ⚠️  Not found: "${name}" (type=language)`);
        notFound++;
      }
    }

    // Set all languages NOT in the list to inactive
    const activeNames = LANGUAGE_RANKS.map((l) => l.name);
    const inactiveResult = await client.query(
      `UPDATE "filters" SET "status" = 'inactive' WHERE "type" = 'language' AND "name" != ALL($1::text[])`,
      [activeNames]
    );
    console.log(`  ✅ Set inactive: ${inactiveResult.rowCount} languages not in list`);

    console.log(`\n✅ Done. Updated: ${updated}, Not found: ${notFound}`);
  } catch (err) {
    console.error("❌ Script failed:", err);
  } finally {
    await client.end();
  }
}

setLanguageRanks();
