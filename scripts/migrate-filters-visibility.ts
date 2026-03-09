import { Client } from "pg";

const TARGET_DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "select-server-dev",
  password: process.env.DB_PASSWORD || "hO82GcLotttB5bLyoeG1",
  database: process.env.DB_NAME || "sage_staging",
};

const USECASES = [
  "Advertising", "Automobile", "Background Scores", "Beauty & Wellness",
  "Bumpers", "Comedy", "Corporate", "Devotional", "Fashion", "Festive Content",
  "Financial Services", "Food", "Gaming", "Health & Fitness", "Intros & Outros",
  "Jingles", "Kids", "Learning & Ed-Tech", "Meditation", "Non Profits & NGO",
  "Patriotic", "Pet Care", "Podcasts & Audiobooks", "Promos & Trailers",
  "Shorts & Reels", "Sports", "Technology", "Travel", "Unboxing & Reviews",
  "Wedding & Reception",
];

const GENRES = [
  "Acoustic", "Afro", "Ambient", "Bollywood", "Cinematic", "Devotional",
  "Electronic", "Festival", "Funk", "Hip Hop / Rap", "Indian Classical",
  "Indian Contemporary", "Indian Folk", "Indie", "Jazz", "Kids", "Latin",
  "Pop", "Retro", "RnB", "Rock", "Western Classical", "World",
];

const MOODS = [
  "Action", "Adventurous", "Angry", "Anthemic", "Calm", "Celebratory",
  "Dark", "Dramatic", "Dreamy", "Elegant", "Emotional", "Energetic",
  "Ethnic", "Feel Good", "Flirty", "Fun", "Glamorous", "Groovy", "Happy",
  "Heartwarming", "Hopeful", "Inspiring", "Intimate", "Lazy", "Motivational",
  "Mysterious", "Nostalgic", "Relaxing", "Romantic", "Sad", "Sexy",
  "Soulful", "Spiritual", "Thriller",
];

async function migrateFiltersVisibility() {
  const client = new Client(TARGET_DB_CONFIG);

  try {
    await client.connect();
    console.log("✅ Connected to database");

    // Step 1: Add visibility column if not exists
    const checkCol = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'filters' AND column_name = 'visibility';
    `);

    if (checkCol.rows.length === 0) {
      console.log("⏳ Adding 'visibility' column...");
      await client.query(`ALTER TABLE "filters" ADD COLUMN "visibility" BOOLEAN DEFAULT false;`);
      console.log("✅ Column 'visibility' added");
    } else {
      console.log("⚠️  Column 'visibility' already exists, skipping ALTER");
    }

    // Step 2: Set visibility=true and status='active' for usecases
    console.log("\n⏳ Updating usecases...");
    const usecaseResult = await client.query(`
      UPDATE "filters"
      SET "visibility" = true, "status" = 'active'
      WHERE "type" = 'usecase'
        AND "name" = ANY($1::text[])
    `, [USECASES]);
    console.log(`✅ Usecases updated: ${usecaseResult.rowCount} rows`);

    // Step 3: Set visibility=true and status='active' for genres
    console.log("⏳ Updating genres...");
    const genreResult = await client.query(`
      UPDATE "filters"
      SET "visibility" = true, "status" = 'active'
      WHERE "type" = 'genre'
        AND "name" = ANY($1::text[])
    `, [GENRES]);
    console.log(`✅ Genres updated: ${genreResult.rowCount} rows`);

    // Step 4: Set visibility=true and status='active' for moods
    console.log("⏳ Updating moods...");
    const moodResult = await client.query(`
      UPDATE "filters"
      SET "visibility" = true, "status" = 'active'
      WHERE "type" = 'mood'
        AND "name" = ANY($1::text[])
    `, [MOODS]);
    console.log(`✅ Moods updated: ${moodResult.rowCount} rows`);

    // Step 5: Set visibility=false and status='inactive' for everything else
    console.log("⏳ Setting remaining filters to inactive...");
    const inactiveResult = await client.query(`
      UPDATE "filters"
      SET "visibility" = false, "status" = 'inactive'
      WHERE "visibility" IS DISTINCT FROM true
    `);
    console.log(`✅ Remaining filters set to inactive: ${inactiveResult.rowCount} rows`);

    console.log("\n✅ Migration complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrateFiltersVisibility();
