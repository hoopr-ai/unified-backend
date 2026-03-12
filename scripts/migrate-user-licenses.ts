import { Client } from "pg";

// ============ SOURCE DATABASE ============
const SOURCE_DB_CONFIG = {
  host: "34.100.172.44",
  port: 5432,
  user: "s-prod",
  password: "ROUG2gact4whif_oorn",
  database: "S-PROD",
};

// ============ TARGET DATABASE ============
const TARGET_DB_CONFIG = {
  // host: "34.47.200.207",
  // port: 5432,
  // user: "select-server-dev",
  // password: "hO82GcLotttB5bLyoeG1",
  // database: "sage_staging",

  host: process.env.DB_HOST || "34.47.153.109",
  user: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl: { rejectUnauthorized: false },
};

const SOURCE_USER_EMAIL = "abhijeet.dsouza@rajasthanroyals.com";
const TARGET_USER_ID = 19;

async function migrateUserLicenses() {
  const source = new Client(SOURCE_DB_CONFIG);
  const target = new Client(TARGET_DB_CONFIG);

  try {
    await source.connect();
    console.log("✅ Connected to source DB");

    await target.connect();
    console.log("✅ Connected to target DB");

    // Step 1: Get brandId for userId=67 in target DB
    const brandRes = await target.query(
      `SELECT "brandId" FROM users WHERE id = $1`,
      [TARGET_USER_ID],
    );
    if (brandRes.rows.length === 0) {
      throw new Error(`User ${TARGET_USER_ID} not found in target DB`);
    }
    const brandId = brandRes.rows[0].brandId;
    console.log(`✅ brandId for userId=${TARGET_USER_ID}: ${brandId}`);

    // Step 2: Fetch all transactions + transactionInfo for this user from source
    const txRes = await source.query(
      `
      SELECT
        t.order_id,
        t."createdAt" AS licensed_at,
        ti.sku_id,
        ti."itemId" AS track_code,
        ti.qty
      FROM public."Transactions" t
      JOIN public."TransactionInfo" ti ON t.order_id = ti.order_id
      WHERE t.user_id = (
        SELECT id FROM public.users WHERE email = $1 LIMIT 1
      )
      ORDER BY t."createdAt" ASC
    `,
      [SOURCE_USER_EMAIL],
    );

    console.log(
      `✅ Found ${txRes.rows.length} TransactionInfo rows from source`,
    );

    if (txRes.rows.length === 0) {
      console.log("⚠️  No transactions found. Exiting.");
      return;
    }

    // Step 3: Fetch all video links for this user from source (keyed by sku_id)
    const orderIds = [...new Set(txRes.rows.map((r: any) => r.order_id))];
    const vlRes = await source.query(
      `
      SELECT vl.id, vl.order_id, vl.sku_id, vl.url, vl.status, vl."trackCode", vl."createdAt"
      FROM public."VideoLinks" vl
      WHERE vl.order_id = ANY($1::text[])
        AND vl.url IS NOT NULL
        AND vl.url != ''
    `,
      [orderIds],
    );

    // Group video links by order_id + sku_id
    const videoLinkMap = new Map<string, any[]>();
    for (const vl of vlRes.rows) {
      const key = `${vl.order_id}__${vl.sku_id}`;
      if (!videoLinkMap.has(key)) videoLinkMap.set(key, []);
      videoLinkMap.get(key)!.push(vl);
    }
    console.log(`✅ Found ${vlRes.rows.length} video links from source`);

    // Step 4: Insert licenses and video_links into target
    let licensesCreated = 0;
    let videoLinksCreated = 0;
    let skipped = 0;

    for (const row of txRes.rows) {
      const { order_id, licensed_at, sku_id, track_code, qty } = row;

      if (!track_code) {
        console.warn(
          `⚠️  Skipping order_id=${order_id}, sku_id=${sku_id} — no trackCode`,
        );
        skipped++;
        continue;
      }

      // Verify trackCode exists in target tracks table
      const trackCheck = await target.query(
        `SELECT "trackCode" FROM tracks WHERE "trackCode" = $1 LIMIT 1`,
        [track_code],
      );
      if (trackCheck.rows.length === 0) {
        console.warn(
          `⚠️  trackCode "${track_code}" not found in target tracks. Skipping.`,
        );
        skipped++;
        continue;
      }

      // Per qty = per license record (1 token per download)
      const licenseCount = Math.max(1, parseInt(qty) || 1);
      let firstLicenseId: number | null = null;

      for (let i = 0; i < licenseCount; i++) {
        const insertLicense = await target.query(
          `
          INSERT INTO licenses ("brandId", "userId", "trackCode", "tokenCost", "licensedAt", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
          [
            brandId,
            TARGET_USER_ID,
            track_code,
            1,
            licensed_at,
            licensed_at,
            licensed_at,
          ],
        );

        const licenseId = insertLicense.rows[0].id;
        licensesCreated++;

        if (firstLicenseId === null) firstLicenseId = licenseId;
      }

      // Step 5: Attach video links to the first license created for this TransactionInfo
      const vlKey = `${order_id}__${sku_id}`;
      const videoLinks = videoLinkMap.get(vlKey) || [];

      for (const vl of videoLinks) {
        const vlStatus =
          vl.status === "APPROVED" ? "APPROVED" : vl.status || "ACTIVE";
        const vlTrackCode = vl.trackCode || track_code;

        await target.query(
          `
          INSERT INTO video_links ("licenseId", "url", "status", "trackCode", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            firstLicenseId,
            vl.url,
            vlStatus,
            vlTrackCode,
            vl.createdAt || licensed_at,
            vl.createdAt || licensed_at,
          ],
        );

        videoLinksCreated++;
      }
    }

    console.log("\n========== Migration Summary ==========");
    console.log(`✅ Licenses created  : ${licensesCreated}`);
    console.log(`✅ Video links created: ${videoLinksCreated}`);
    console.log(`⚠️  Rows skipped      : ${skipped}`);
    console.log("=======================================\n");
    console.log("✅ Migration complete!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await source.end();
    await target.end();
  }
}

migrateUserLicenses();
