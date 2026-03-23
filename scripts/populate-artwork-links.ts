import { Client } from "pg";
import { Storage } from "@google-cloud/storage";

// ============ CONFIG ============
// Uses production GCP SA key and production DB by default.
// Override via environment variables or edit the constants below.

const BUCKET_NAME = "cdn-hooprsmash-com-prod";
const BUCKET_PREFIX = "web/tracks/";
const CDN_BASE_URL = "https://cdn-prod.hooprsmash.com";

// DB config — update to point to production DB when ready
const DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.153.109",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  ssl: { rejectUnauthorized: false },
};

// Production GCP Service Account (has access to cdn-hooprsmash-com-prod bucket)
const GCP_SA_KEY = process.env.GCP_SA_KEY_JSON
  ? JSON.parse(process.env.GCP_SA_KEY_JSON)
  : {
      type: "service_account",
      project_id: "prod-smash",
      private_key_id: "d8272c446a9b5890f70991c20181f781353c9611",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCuSJA7u3jxedpA\nsCSglizbRFETgEBRk0o/yaX5aFF02XdRCGkYkztgANyKr7RDf5X1AXv8Z25MtVXI\n6na2oC19gq6GOPSO0BbwxHrR75R3uRT3KEF+V0J1MNRqyJ0IPzYyS18dCV6qK9XQ\nKk0FpOQv73/L2KfBcmnc7bcJ+6DgwHtOU8SbJEe7ujchO29IT8F/rHyg3qINNY27\neLvaX1FEDCyloYRtCIaYgImiR+DZrqixnLfzeorV2hckAnezFZ7u2GUrL2ubGDQH\nTA+89XrNYntuzbI2dQ0Gdve7y4XMsC1NhuK6eWZqsqzGAbaUGdmPOGOHaSQWR7AX\nrTxUWCs5AgMBAAECggEABPddYM5dSmhB/2DlkkvlOFRQiSE48/oh/gJVf+9ojs9Z\nlo4KTKB5aylrH2qVVO0QTVx+93jNDFOIf8KqolabJT3xkjKSSXWFidPXeh79GJJG\nFirn/t0msCc1jltsGh2PAkzih3XKZEf+fkGOU1BZDkKhXiIs2ZbUjG6briWk9nKJ\nhdwwDf1zf8S5ulWJEKypQYa8SyRHKWDs8zTP7Z/FOfcCgpTFu76EMqVaqUfAIMwj\nhzLZkwLbFT6t30o0Dru7a0krD6PpmI0muPPmmI3XjLBqzi7sjvJkR9zchHNU9wA9\nCU2hcscFjuURvInh0WoBqQB2xSsvtiYFVriFQob9eQKBgQD0q/DmH/Eldl6bAP59\nP4+DN5IRv2l889Eix9CJ2kgua/drqisTMtm53TuxvIiSpD88AxDnDH/0/SGh4fJF\n26RpbsoEHcglupjL32/aCBojUhK0alSv5DmpB2ypKxC6JfSm2QTLYGvg0hDLwAW3\no1pDpQ4WjXa3DtXz9LFjKslF5QKBgQC2WlIoI2Xsksc4L2sEyR0xtoYNIjgIkJKj\nRjZ3txExjE+iQ3XZ0XyZ/TK02sr4Ugx5uhPmlIioVrsvAgkn6W3C1DZcAa/BvDSo\n6Zu0yZCMqkRDZ8HELCFQW9M3bKEas6ir32iyVc6xRKcAZnk9Vywk48YgEF2j4mZ+\n9xGChSm6xQKBgAoi0WEHM7tEkxjCysgviOd7tt5rWphllWVmd7ouQ81Ahch9DTnH\nYoOzqZRsZhAFI+V9jwazWt2wWuNU8+928PG5OD9BaJg/ibLwd7bFnSeXb9TvjsCW\nqNjayOKdOR0tE1ySIwO14+I1caKvOs1nxAaHYPUIOUHOKIjpuyuLizkNAoGALNSn\nvhZ1yGONdtKxjMuk0cP90NzIydJBOsLYQTZQk83bBhlvr81AxNrqzGu92q7RQlvs\n6JM7xacM/dGSTq2kvnFNq/D+NLMAf0ZvcVLcprh1b9ziVkhDKG5qzwV11gq1PQv/\nwVg3KH2oUQDgbaQwxiD5ZIihfNj8OdqkA2KZj8ECgYEAuZe9QvSxCtMg355jNbWd\nvdLC2KXYz1WwKpyqHRqzW3Bc3BDPm59WS2zm7v1vnRgA6n4pl6PP6ZiYwpUplPO7\ngDo+Db1xBG/1kto0TirSxYhkpE8wuC3mNhgKPGoMDgSchv9cxZCevbZ4iGOA9ars\ndt1fzP2fksLqTIPHbDW1jwM=\n-----END PRIVATE KEY-----\n",
      client_email: "backend-storage@prod-smash.iam.gserviceaccount.com",
      client_id: "113197711282124728322",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url:
        "https://www.googleapis.com/robot/v1/metadata/x509/backend-storage%40prod-smash.iam.gserviceaccount.com",
      universe_domain: "googleapis.com",
    };

// ============ STATS ============
const stats = {
  bucketFiles: 0,
  tracksUpdated: 0,
  tracksNotFound: 0,
  tracksFailed: 0,
};
const notFoundCodes: string[] = [];

// ============ MAIN ============
async function main() {
  const db = new Client(DB_CONFIG);

  try {
    await db.connect();
    console.log("✅ Connected to database");

    // Ensure artworkLink column exists
    await db.query(`
      ALTER TABLE tracks
      ADD COLUMN IF NOT EXISTS "artworkLink" TEXT NULL
    `);
    console.log('✅ Ensured "artworkLink" column on tracks table');

    // Connect to GCP Storage
    const storage = new Storage({ credentials: GCP_SA_KEY });
    const bucket = storage.bucket(BUCKET_NAME);

    console.log(
      `\n📦 Listing files in gs://${BUCKET_NAME}/${BUCKET_PREFIX} ...`,
    );

    const [files] = await bucket.getFiles({ prefix: BUCKET_PREFIX });
    stats.bucketFiles = files.length;
    console.log(`✅ Found ${files.length} files in bucket`);

    for (const file of files) {
      const filename = file.name.replace(BUCKET_PREFIX, ""); // e.g. "6331.webp"
      if (!filename.endsWith(".webp")) continue;

      const trackCode = filename.replace(".webp", ""); // e.g. "6331"
      const artworkLink = `${CDN_BASE_URL}/${file.name}`; // full CDN URL

      try {
        const result = await db.query(
          `UPDATE tracks SET "artworkLink" = $1 WHERE "trackCode" = $2`,
          [artworkLink, trackCode],
        );

        if (result.rowCount && result.rowCount > 0) {
          stats.tracksUpdated++;
        } else {
          stats.tracksNotFound++;
          notFoundCodes.push(trackCode);
        }
      } catch (err) {
        stats.tracksFailed++;
        console.error(
          `❌ Failed to update track ${trackCode}:`,
          (err as Error).message,
        );
      }
    }

    // ============ SUMMARY ============
    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Bucket files found:    ${stats.bucketFiles}`);
    console.log(`✅ Tracks updated:        ${stats.tracksUpdated}`);
    console.log(`⚠️  Tracks not in DB:     ${stats.tracksNotFound}`);
    console.log(`❌ Tracks failed:         ${stats.tracksFailed}`);

    if (notFoundCodes.length > 0) {
      console.log(
        `\n📋 TrackCodes in bucket but NOT in DB (${notFoundCodes.length}):`,
      );
      notFoundCodes.forEach((code) => console.log(`   ${code}`));
    }

    console.log("=".repeat(60));
    console.log("✨ Done!\n");
  } catch (err) {
    console.error("❌ Script failed:", err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
