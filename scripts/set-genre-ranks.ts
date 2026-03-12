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

const GENRE_RANKS: { name: string; rank: number }[] = [
  { name: "Acoustic", rank: 1 },
  { name: "Kids", rank: 2 },
  { name: "Indian Contemporary", rank: 3 },
  { name: "Corporate", rank: 4 },
  { name: "Jazz", rank: 5 },
  { name: "Ambient", rank: 6 },
  { name: "Indie", rank: 7 },
  { name: "Pop", rank: 8 },
  { name: "Western Classical", rank: 9 },
  { name: "Devotional", rank: 10 },
  { name: "Electronic", rank: 11 },
  { name: "Bollywood", rank: 12 },
  { name: "Cinematic", rank: 13 },
  { name: "Indian Folk", rank: 14 },
  { name: "World", rank: 15 },
  { name: "Funk", rank: 16 },
  { name: "Retro", rank: 17 },
  { name: "Indian Classical", rank: 18 },
  { name: "Hip Hop / Rap", rank: 19 },
  { name: "Latin", rank: 20 },
  { name: "Festival", rank: 21 },
  { name: "Rock", rank: 22 },
  { name: "Afro", rank: 23 },
  { name: "R&B", rank: 24 },
];

async function setGenreRanks() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    let updated = 0;
    let notFound = 0;

    for (const { name, rank } of GENRE_RANKS) {
      const result = await client.query(
        `UPDATE "filters" SET "rank" = $1 WHERE "name" = $2 AND "type" = 'genre' RETURNING "id", "name"`,
        [rank, name],
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(`  ✅ [${rank}] ${name}`);
        updated++;
      } else {
        console.warn(`  ⚠️  Not found: "${name}" (type=genre)`);
        notFound++;
      }
    }

    // Set all genres NOT in the list to inactive
    const activeNames = GENRE_RANKS.map((g) => g.name);
    const inactiveResult = await client.query(
      `UPDATE "filters" SET "status" = 'inactive' WHERE "type" = 'genre' AND "name" != ALL($1::text[])`,
      [activeNames]
    );
    console.log(`  ✅ Set inactive: ${inactiveResult.rowCount} genres not in list`);

    console.log(`\n✅ Done. Updated: ${updated}, Not found: ${notFound}`);
  } catch (err) {
    console.error("❌ Script failed:", err);
  } finally {
    await client.end();
  }
}

setGenreRanks();
