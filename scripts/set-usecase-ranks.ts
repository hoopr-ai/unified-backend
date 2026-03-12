import { Client } from "pg";

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.153.109",
  user: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl: { rejectUnauthorized: false },
};

const USECASE_RANKS: { name: string; rank: number }[] = [
  { name: "Advertising", rank: 1 },
  { name: "Automobile", rank: 2 },
  { name: "Background Scores", rank: 3 },
  { name: "Beauty & Wellness", rank: 4 },
  { name: "Bumpers", rank: 5 },
  { name: "Comedy", rank: 6 },
  { name: "Corporate", rank: 7 },
  { name: "Devotional", rank: 8 },
  { name: "Fashion", rank: 9 },
  { name: "Festive Content", rank: 10 },
  { name: "Financial Services", rank: 11 },
  { name: "Food", rank: 12 },
  { name: "Gaming", rank: 13 },
  { name: "Health & Fitness", rank: 14 },
  { name: "Intros & Outros", rank: 15 },
  { name: "Jingles", rank: 16 },
  { name: "Kids", rank: 17 },
  { name: "Learning & Ed-Tech", rank: 18 },
  { name: "Meditation", rank: 19 },
  { name: "Non Profits & NGO", rank: 20 },
  { name: "Patriotic", rank: 21 },
  { name: "Pet Care", rank: 22 },
  { name: "Podcasts & Audiobooks", rank: 23 },
  { name: "Promos & Trailers", rank: 24 },
  { name: "Shorts & Reels", rank: 25 },
  { name: "Sports", rank: 26 },
  { name: "Technology", rank: 27 },
  { name: "Travel", rank: 28 },
  { name: "Unboxing & Reviews", rank: 29 },
  { name: "Wedding & Reception", rank: 30 },
];

async function setUsecaseRanks() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    let updated = 0;
    let notFound = 0;

    for (const { name, rank } of USECASE_RANKS) {
      const result = await client.query(
        `UPDATE "filters" SET "rank" = $1 WHERE "name" = $2 AND "type" = 'usecase' RETURNING "id", "name"`,
        [rank, name],
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(`  ✅ [${rank}] ${name}`);
        updated++;
      } else {
        console.warn(`  ⚠️  Not found: "${name}" (type=usecase)`);
        notFound++;
      }
    }

    // Set all usecases NOT in the list to inactive
    const activeNames = USECASE_RANKS.map((u) => u.name);
    const inactiveResult = await client.query(
      `UPDATE "filters" SET "status" = 'inactive' WHERE "type" = 'usecase' AND "name" != ALL($1::text[])`,
      [activeNames]
    );
    console.log(`  ✅ Set inactive: ${inactiveResult.rowCount} usecases not in list`);

    console.log(`\n✅ Done. Updated: ${updated}, Not found: ${notFound}`);
  } catch (err) {
    console.error("❌ Script failed:", err);
  } finally {
    await client.end();
  }
}

setUsecaseRanks();
