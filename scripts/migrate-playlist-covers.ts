/**
 * Script: Migrate Playlist Cover Images
 *
 * Copies playlist cover images from the source bucket to the CDN bucket,
 * converting jpg → webp and renaming by playlistCode.
 *
 * Source: unified_backend_prod/playlist/{uuid}/cover.jpg
 * Dest:   cdn-hooprsmash-com-prod/web/playlists/{playlistCode}.webp
 *
 * Also updates the `imageLink` column in the playlists table with the CDN URL.
 *
 * Usage:
 *   npx ts-node scripts/migrate-playlist-covers.ts
 *
 * Options:
 *   --dry-run     List what would be done without uploading or updating DB
 *   --force       Re-upload even if the destination file already exists
 *   --limit=N     Process only the first N playlists
 */

import { config } from "dotenv";
import { Client } from "pg";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";

config();

// ============ CONFIG ============

const SOURCE_BUCKET = "hoopr-stream-prod";
const SOURCE_PREFIX = "playlist/";

const DEST_BUCKET = "cdn-hooprsmash-com-prod";
const DEST_PREFIX = "web/playlists/";
const CDN_BASE_URL = "https://cdn-prod.hooprsmash.com";

const DB_CONFIG = {
  host: process.env.DB_HOST || "34.47.153.109",
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER || "unified-prod",
  password: process.env.DB_PASSWORD || 'X"E6o+`{yvN|c30R',
  database: process.env.DB_NAME || "unified-backend-prod",
  ssl: { rejectUnauthorized: false },
};

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
      auth_provider_x509_cert_url:
        "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url:
        "https://www.googleapis.com/robot/v1/metadata/x509/backend-storage%40prod-smash.iam.gserviceaccount.com",
      universe_domain: "googleapis.com",
    };

// ============ ARGS ============

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : Infinity;

// ============ STATS ============

const stats = {
  sourceFiles: 0,
  skippedNoCover: 0,
  skippedNoCode: 0,
  skippedAlreadyExists: 0,
  uploaded: 0,
  dbUpdated: 0,
  failed: 0,
};

// ============ HELPERS ============

function extractUuid(filePath: string): string | null {
  // Expected: playlist/{uuid}/cover.jpg
  const match = filePath.match(
    /^playlist\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/cover\.jpg$/i,
  );
  return match ? match[1] : null;
}

async function downloadAsBuffer(
  storage: Storage,
  bucket: string,
  filePath: string,
): Promise<Buffer> {
  const [contents] = await storage.bucket(bucket).file(filePath).download();
  return contents;
}

// ============ MAIN ============

async function main() {
  if (DRY_RUN) console.log("🔍 DRY RUN — no files will be uploaded or DB rows updated\n");

  const db = new Client(DB_CONFIG);
  const storage = new Storage({ credentials: GCP_SA_KEY });

  try {
    await db.connect();
    console.log("✅ Connected to database");

    // List all files under playlist/ in source bucket
    console.log(`\n📦 Listing files in gs://${SOURCE_BUCKET}/${SOURCE_PREFIX} ...`);
    const [files] = await storage
      .bucket(SOURCE_BUCKET)
      .getFiles({ prefix: SOURCE_PREFIX });
    stats.sourceFiles = files.length;
    console.log(`✅ Found ${files.length} files in source bucket`);

    // Filter to only cover.jpg files
    const coverFiles = files.filter((f) => extractUuid(f.name) !== null);
    console.log(`✅ ${coverFiles.length} playlist cover files found\n`);

    const toProcess = LIMIT < Infinity
      ? coverFiles.slice(0, LIMIT)
      : coverFiles;

    for (const file of toProcess) {
      const uuid = extractUuid(file.name)!;
      // Look up playlistCode
      const { rows } = await db.query<{ playlistCode: string }>(
        `SELECT "playlistCode" FROM playlists WHERE id = $1 LIMIT 1`,
        [uuid],
      );

      if (!rows.length || !rows[0].playlistCode) {
        console.warn(`⚠️  No playlistCode for uuid ${uuid} — skipping`);
        stats.skippedNoCode++;
        continue;
      }

      const playlistCode = rows[0].playlistCode;
      const destFile = `${DEST_PREFIX}${playlistCode}.webp`;
      const cdnUrl = `${CDN_BASE_URL}/${destFile}`;

      // Check if destination already exists (skip unless --force)
      if (!FORCE && !DRY_RUN) {
        const [exists] = await storage
          .bucket(DEST_BUCKET)
          .file(destFile)
          .exists();
        if (exists) {
          console.log(`⏭️  ${destFile} already exists — skipping (use --force to overwrite)`);
          stats.skippedAlreadyExists++;
          continue;
        }
      }

      console.log(`📸 ${file.name}  →  ${destFile}`);

      if (!DRY_RUN) {
        try {
          // Download source jpg
          const jpgBuffer = await downloadAsBuffer(storage, SOURCE_BUCKET, file.name);

          // Convert to webp
          const webpBuffer = await sharp(jpgBuffer)
            .webp({ quality: 85 })
            .toBuffer();

          // Upload to CDN bucket
          await storage.bucket(DEST_BUCKET).file(destFile).save(webpBuffer, {
            contentType: "image/webp",
            metadata: { cacheControl: "public, max-age=31536000" },
          });
          stats.uploaded++;

          // Update imageLink in DB
          const result = await db.query(
            `UPDATE playlists SET "imageLink" = $1 WHERE id = $2`,
            [cdnUrl, uuid],
          );
          if (result.rowCount && result.rowCount > 0) {
            stats.dbUpdated++;
            console.log(`   ✅ Uploaded + DB updated  (playlistCode=${playlistCode})`);
          } else {
            console.warn(`   ✅ Uploaded but DB row not found for uuid ${uuid}`);
          }
        } catch (err) {
          stats.failed++;
          console.error(
            `   ❌ Failed for ${file.name}:`,
            (err as Error).message,
          );
        }
      } else {
        console.log(`   [dry-run] Would upload as ${cdnUrl}`);
      }
    }

    // ============ SUMMARY ============
    console.log("\n" + "=".repeat(60));
    console.log("📊 SUMMARY");
    console.log("=".repeat(60));
    console.log(`📦 Source files scanned:     ${stats.sourceFiles}`);
    console.log(`⚠️  No playlistCode in DB:   ${stats.skippedNoCode}`);
    console.log(`⏭️  Already in dest bucket:  ${stats.skippedAlreadyExists}`);
    console.log(`✅ Uploaded:                 ${stats.uploaded}`);
    console.log(`✅ DB imageLink updated:     ${stats.dbUpdated}`);
    console.log(`❌ Failed:                   ${stats.failed}`);
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
