import { Client } from "pg";
import { config } from "dotenv";

config();

// Adds occasionCode + imageLink to the occasions table, then backfills
// occasionCode for existing rows (slugified title, disambiguated on
// collision). Safe to re-run: column adds are IF NOT EXISTS and the backfill
// only touches rows where occasionCode IS NULL.
async function migrateAddOccasionCodeImage() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { require: true, rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("✅ Connected to database");

    await client.query(
      `ALTER TABLE occasions ADD COLUMN IF NOT EXISTS "occasionCode" VARCHAR(255) UNIQUE;`,
    );
    await client.query(
      `ALTER TABLE occasions ADD COLUMN IF NOT EXISTS "imageLink" VARCHAR(1024);`,
    );
    console.log("✅ Columns occasionCode + imageLink ensured");

    const { rows } = await client.query<{ id: number; title: string }>(
      `SELECT id, title FROM occasions WHERE "occasionCode" IS NULL ORDER BY id ASC`,
    );
    console.log(`📋 ${rows.length} occasions need a backfilled occasionCode`);

    const slugify = (input: string): string =>
      input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 200);

    const usedCodes = new Set<string>();
    for (const row of rows) {
      const base = slugify(row.title) || `occasion-${row.id}`;
      let candidate = base;
      let suffix = 2;
      while (usedCodes.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix++;
      }
      usedCodes.add(candidate);

      await client.query(
        `UPDATE occasions SET "occasionCode" = $1 WHERE id = $2`,
        [candidate, row.id],
      );
      console.log(`  #${row.id} "${row.title}" → ${candidate}`);
    }

    console.log(`\n✅ Backfilled ${rows.length} occasionCode value(s).`);
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.end();
  }
}

migrateAddOccasionCodeImage();
