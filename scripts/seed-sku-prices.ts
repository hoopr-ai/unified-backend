import { Client } from "pg";
import { config } from "dotenv";

config();

const DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.200.207",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "sage_staging",
  ssl: { require: true, rejectUnauthorized: false },
};

// Matches the 20-char alphanumeric IDs used in existing SKUs
function generateId(length = 20): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Dummy prices matching the most common non-zero combo in existing SKUs
const DUMMY_COST_PRICE = 1499;
const DUMMY_SELLING_PRICE = 599;

async function seedSkuPrices() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log("✅ Connected to database:", DB_CONFIG.database);

  try {
    // 1. Fix existing SKUs with null prices
    const nullPriceResult = await client.query(`
      SELECT id, "trackCode" FROM "SKUs"
      WHERE "sellingPrice" IS NULL OR "costPrice" IS NULL
    `);

    if (nullPriceResult.rows.length > 0) {
      console.log(`\n⚙️  Fixing ${nullPriceResult.rows.length} SKU(s) with null prices...`);
      for (const row of nullPriceResult.rows) {
        await client.query(`
          UPDATE "SKUs"
          SET "costPrice" = $1, "sellingPrice" = $2, "updatedAt" = NOW()
          WHERE id = $3
        `, [DUMMY_COST_PRICE, DUMMY_SELLING_PRICE, row.id]);
        console.log(`  ✅ Updated SKU ${row.id} (trackCode: ${row.trackCode})`);
      }
    } else {
      console.log("\n✅ No SKUs with null prices found.");
    }

    // 2. Find active tracks without any SKU
    const missingResult = await client.query(`
      SELECT t."trackCode"
      FROM tracks t
      WHERE NOT EXISTS (
        SELECT 1 FROM "SKUs" s WHERE s."trackCode" = t."trackCode"
      )
      AND t.status = 'ACTIVE'
      ORDER BY t."trackCode"
    `);

    const trackCodes: string[] = missingResult.rows.map((r) => r.trackCode);
    console.log(`\n📦 Found ${trackCodes.length} active tracks without a SKU.`);

    if (trackCodes.length === 0) {
      console.log("✅ All active tracks already have SKUs.");
      return;
    }

    // 3. Batch insert SKUs in chunks of 500
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < trackCodes.length; i += BATCH_SIZE) {
      const batch = trackCodes.slice(i, i + BATCH_SIZE);

      const valuePlaceholders: string[] = [];
      const values: (string | number)[] = [];
      let paramIdx = 1;

      for (const trackCode of batch) {
        valuePlaceholders.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, NOW(), NOW())`
        );
        values.push(
          generateId(),     // id
          trackCode,        // trackCode
          "T",              // itemType
          DUMMY_COST_PRICE, // costPrice
          DUMMY_SELLING_PRICE, // sellingPrice
          18,               // gstPercent
          3                 // maxUsage
        );
      }

      await client.query(`
        INSERT INTO "SKUs" (id, "trackCode", "itemType", "costPrice", "sellingPrice", "gstPercent", "maxUsage", "createdAt", "updatedAt")
        VALUES ${valuePlaceholders.join(", ")}
        ON CONFLICT DO NOTHING
      `, values);

      inserted += batch.length;
      console.log(`  ✅ Inserted ${inserted}/${trackCodes.length} SKUs...`);
    }

    console.log(`\n🎉 Done! Inserted ${inserted} dummy SKUs (costPrice: ${DUMMY_COST_PRICE}, sellingPrice: ${DUMMY_SELLING_PRICE}).`);

  } finally {
    await client.end();
  }
}

seedSkuPrices().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
