import { Client } from "pg";

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
};

const MOOD_RANKS: { name: string; rank: number }[] = [
  { name: "Happy", rank: 1 },
  { name: "Celebratory", rank: 2 },
  { name: "Action", rank: 3 },
  { name: "Calm", rank: 4 },
  { name: "Emotional", rank: 5 },
  { name: "Elegant", rank: 6 },
  { name: "Dramatic", rank: 7 },
  { name: "Motivational", rank: 8 },
  { name: "Nostalgic", rank: 9 },
  { name: "Romantic", rank: 10 },
  { name: "Relaxing", rank: 11 },
  { name: "Fun", rank: 12 },
  { name: "Hopeful", rank: 13 },
  { name: "Inspiring", rank: 14 },
  { name: "Feel Good", rank: 15 },
  { name: "Heartwarming", rank: 16 },
  { name: "Energetic", rank: 17 },
  { name: "Ethnic", rank: 18 },
  { name: "Soulful", rank: 19 },
  { name: "Spiritual", rank: 20 },
  { name: "Thriller", rank: 21 },
  { name: "Sad", rank: 22 },
  { name: "Sexy", rank: 23 },
  { name: "Lazy", rank: 24 },
  { name: "Intimate", rank: 25 },
  { name: "Glamorous", rank: 26 },
  { name: "Groovy", rank: 27 },
  { name: "Adventurous", rank: 28 },
  { name: "Anthemic", rank: 29 },
  { name: "Mysterious", rank: 30 },
  { name: "Dreamy", rank: 31 },
  { name: "Angry", rank: 32 },
  { name: "Flirty", rank: 33 },
  { name: "Dark", rank: 34 },
];

async function setMoodRanks() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    let updated = 0;
    let notFound = 0;

    for (const { name, rank } of MOOD_RANKS) {
      const result = await client.query(
        `UPDATE "filters" SET "rank" = $1 WHERE "name" = $2 AND "type" = 'mood' RETURNING "id", "name"`,
        [rank, name]
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(`  ✅ [${rank}] ${name}`);
        updated++;
      } else {
        console.warn(`  ⚠️  Not found: "${name}" (type=mood)`);
        notFound++;
      }
    }

    console.log(`\n✅ Done. Updated: ${updated}, Not found: ${notFound}`);
  } catch (err) {
    console.error("❌ Script failed:", err);
  } finally {
    await client.end();
  }
}

setMoodRanks();
