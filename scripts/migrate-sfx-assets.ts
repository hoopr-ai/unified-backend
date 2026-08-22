/**
 * Script: Migrate SFX Assets (audio links + artwork) into the unified catalog
 *
 * The 6,110 `tracks` rows with type='sfx' came across from the legacy hoopr
 * catalog with every asset column empty — no mp3Link, no waveformLink, no
 * artworkLink — so NATIVE-BE serves SFX that cannot be played and render with
 * no tile art.
 *
 * The FILES, however, are already where they need to be. SFX rows kept their
 * hoopr UUID (the old S00xxxx code survives in `pastIds[1]`), and every
 * sfxs/{id}/... object was mirrored out of hoopr-stream-prod into both
 * unified_backend_prod (audio, fronted by cdn.gcp.select.hoopr.ai) and
 * cdn-hooprsmash-com-prod (images, fronted by cdn-prod.hooprsmash.com). So this
 * is overwhelmingly a link-population job, not a file copy.
 *
 * What it does, per SFX track:
 *
 *   mp3Link       ← https://cdn.gcp.select.hoopr.ai/sfxs/{id}/{id}-mp3.mp3
 *   waveformLink  ← .../sfxs/{id}/metaData/{id}-waveform.json
 *                   (note the metaData/ subfolder — music keeps its waveform
 *                    flat alongside the mp3, SFX do not)
 *   artworkLink   ← https://cdn-prod.hooprsmash.com/web/tracks/{trackCode}.webp
 *                   built by converting sfxs/{id}/{id}-image.{jpg,png,jpeg},
 *                   matching how music artwork is stored. Only ~722 SFX have
 *                   their own image; the rest inherit their SFX sub-category's
 *                   picture by URL rather than by copying one shared png into
 *                   thousands of per-trackCode objects.
 *
 * It also repoints `subFilters.imageUrl` for SFX sub-categories: all 58 still
 * name d2ntslqmfg7dws.cloudfront.net, a CloudFront distribution that no longer
 * resolves. The same paths are live under cdn-prod.hooprsmash.com, so only the
 * host changes.
 *
 * NOTHING IS DELETED OR OVERWRITTEN. Uploads carry ifGenerationMatch=0, which
 * makes GCS reject the write if the object already exists, and every UPDATE is
 * gated on the column being empty. Re-running is safe and converges.
 *
 * Unlike its sibling migration scripts, this one talks to GCS over the JSON API
 * with the platform `fetch` instead of @google-cloud/storage. The SDK bundles
 * gaxios 6 / node-fetch 2, which cannot gunzip Google's OAuth response on Node
 * 24+ and dies with ERR_STREAM_PREMATURE_CLOSE — see the note atop
 * migrate-playlist-covers.ts. Signing the assertion here costs ~40 lines and
 * lifts the "run it under an older Node" constraint.
 *
 * Usage:
 *   npx ts-node scripts/migrate-sfx-assets.ts --db=staging --dry-run
 *   npx ts-node scripts/migrate-sfx-assets.ts --db=staging
 *   npx ts-node scripts/migrate-sfx-assets.ts --db=prod
 *
 * Options:
 *   --db=staging|prod   Which catalog to write to (default: staging)
 *   --dry-run           Report the delta; upload nothing, update nothing
 *   --limit=N           Only consider the first N SFX tracks
 *   --skip-uploads      Populate DB links only; do not build any webp artwork
 */

import { config } from "dotenv";
import { Client } from "pg";
import { createSign } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import sharp from "sharp";

config();

// ============ CONFIG ============

// Audio: already mirrored here, fronted by CDN_UNIFIED_URL. NATIVE-BE rewrites
// the host per environment (toAudioCdnUrl) but keeps the path, so storing the
// prod host still resolves correctly when the service runs against staging.
const AUDIO_BUCKET = "unified_backend_prod";
const AUDIO_CDN_BASE = "https://cdn.gcp.select.hoopr.ai";

// Images: both the legacy sfxs/{id}/ originals and the web/tracks/ webp tiles
// live in this bucket. Image links are never host-swapped downstream, so what
// we store here is what the client fetches.
const IMAGE_BUCKET = "cdn-hooprsmash-com-prod";
const IMAGE_CDN_BASE = "https://cdn-prod.hooprsmash.com";
const ARTWORK_PREFIX = "web/tracks/";

// The dead CloudFront distribution still named by every SFX sub-category row.
const DEAD_IMAGE_HOST = "https://d2ntslqmfg7dws.cloudfront.net";

const DB_TARGETS = {
  staging: {
    host: "34.47.200.207",
    port: 5432,
    user: "select-server-dev",
    password: "hO82GcLotttB5bLyoeG1",
    database: "sage_staging",
    ssl: { rejectUnauthorized: false },
  },
  prod: {
    host: "34.47.153.109",
    port: 5432,
    user: "unified-prod",
    password: 'X"E6o+`{yvN|c30R',
    database: "unified-backend-prod",
    ssl: { rejectUnauthorized: false },
  },
} as const;

const GCP_SA_KEY = process.env.GCP_SA_KEY_JSON
  ? JSON.parse(process.env.GCP_SA_KEY_JSON)
  : null;

// ============ ARGS ============

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SKIP_UPLOADS = args.includes("--skip-uploads");
const dbArg = args.find((a) => a.startsWith("--db="));
const DB_KEY = (dbArg ? dbArg.split("=")[1] : "staging") as keyof typeof DB_TARGETS;
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

if (!DB_TARGETS[DB_KEY]) {
  console.error(`❌ Unknown --db=${DB_KEY}. Use --db=staging or --db=prod.`);
  process.exit(1);
}

// ============ STATS ============

const stats = {
  sfxRows: 0,
  mp3Linked: 0,
  mp3Missing: 0,
  waveformLinked: 0,
  waveformMissing: 0,
  artworkUploaded: 0,
  artworkAlreadyInBucket: 0,
  artworkFromOwnImage: 0,
  artworkFromCategory: 0,
  artworkNoSource: 0,
  artworkLeftAlone: 0,
  subFilterHostsFixed: 0,
  failed: 0,
};

// ============ GCS (JSON API over platform fetch) ============

const b64url = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

let cachedToken: { value: string; expiresAt: number } | null = null;

async function gcsToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }
  if (!GCP_SA_KEY) {
    throw new Error("Missing GCP_SA_KEY_JSON environment variable");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: GCP_SA_KEY.client_email,
      scope: "https://www.googleapis.com/auth/devstorage.read_write",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const signature = b64url(
    createSign("RSA-SHA256").update(`${header}.${claim}`).sign(GCP_SA_KEY.private_key),
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!json.access_token) {
    throw new Error(`GCS auth failed: ${json.error_description ?? JSON.stringify(json)}`);
  }

  cachedToken = { value: json.access_token, expiresAt: Date.now() + 3600 * 1000 };
  return cachedToken.value;
}

/** Every object name under `prefix`. Paged; a full sfxs/ listing is ~30k names. */
async function gcsList(bucket: string, prefix: string): Promise<Set<string>> {
  const token = await gcsToken();
  const names = new Set<string>();
  let pageToken: string | undefined;

  do {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${bucket}/o`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("maxResults", "1000");
    url.searchParams.set("fields", "items(name),nextPageToken");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as {
      items?: { name: string }[];
      nextPageToken?: string;
      error?: { message: string };
    };
    if (json.error) throw new Error(`List gs://${bucket}/${prefix}: ${json.error.message}`);
    for (const item of json.items ?? []) names.add(item.name);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return names;
}

async function gcsDownload(bucket: string, object: string): Promise<Buffer> {
  const token = await gcsToken();
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Download gs://${bucket}/${object} → HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Create an object, refusing to replace one. ifGenerationMatch=0 means "only if
 * this name is currently absent"; GCS answers 412 otherwise, which we surface as
 * `false` rather than an error so a re-run just reports it as already present.
 */
async function gcsUploadIfAbsent(
  bucket: string,
  object: string,
  body: Buffer,
  contentType: string,
): Promise<boolean> {
  const token = await gcsToken();
  const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o`);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("ifGenerationMatch", "0");

  // Multipart rather than a plain media upload: it is the only form that carries
  // object metadata, and without an explicit contentType GCS stores the tile as
  // application/octet-stream — which is exactly why the legacy sfxs/ images are
  // typed that way today.
  const boundary = "sfx-migration-boundary";
  const metadata = JSON.stringify({
    name: object,
    contentType,
    cacheControl: "public, max-age=31536000",
  });
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: new Uint8Array(payload),
  });
  if (res.status === 412) return false;
  if (!res.ok) {
    throw new Error(`Upload gs://${bucket}/${object} → HTTP ${res.status} ${await res.text()}`);
  }
  return true;
}

// ============ HELPERS ============

interface SfxRow {
  id: string;
  trackCode: string;
  artworkLink: string | null;
  mp3Link: string | null;
  waveformLink: string | null;
}

const isEmpty = (value: string | null | undefined): boolean => !value || value.trim() === "";

/**
 * Percent-encode an already-absolute URL's path. Five sub-category images have
 * spaces in the filename ("ganga arti.png"); left raw they are an invalid URL
 * and never load.
 */
function encodeUrlPath(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.split("/").map((s) => encodeURIComponent(decodeURIComponent(s))).join("/");
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Legacy CloudFront URL → the same object on the live image CDN. */
function reviveImageHost(url: string): string {
  return encodeUrlPath(url.replace(DEAD_IMAGE_HOST, IMAGE_CDN_BASE));
}

// SFX images were uploaded in whatever format the source asset happened to be.
const IMAGE_EXTS = ["jpg", "png", "jpeg"] as const;

// ============ MAIN ============

async function main() {
  console.log(`🎯 Target catalog: ${DB_KEY} (${DB_TARGETS[DB_KEY].database})`);
  if (DRY_RUN) console.log("🔍 DRY RUN — nothing will be uploaded or written\n");

  const db = new Client(DB_TARGETS[DB_KEY]);
  await db.connect();
  console.log("✅ Connected to database");

  try {
    // ---- Load the SFX catalog --------------------------------------------
    const { rows } = await db.query<SfxRow>(
      `SELECT id, "trackCode", "artworkLink", "mp3Link", "waveformLink"
         FROM tracks
        WHERE LOWER(COALESCE(type, '')) = 'sfx'
        ORDER BY "trackCode"`,
    );
    const sfx = LIMIT < Infinity ? rows.slice(0, LIMIT) : rows;
    stats.sfxRows = sfx.length;
    console.log(`✅ ${sfx.length} SFX tracks in catalog`);

    // Each track's SFX sub-category picture, for tracks with no image of their
    // own. A track can sit in several sub-categories; take the first by name so
    // the choice is stable across runs.
    const { rows: catRows } = await db.query<{ trackId: string; imageUrl: string }>(
      `SELECT "trackId", "imageUrl" FROM (
         SELECT m."trackId",
                sf."imageUrl",
                ROW_NUMBER() OVER (PARTITION BY m."trackId" ORDER BY sf.name) AS rn
           FROM track_subfilter_mappings m
           JOIN "subFilters" sf ON sf.id = m."subFilterId"
          WHERE LOWER(sf.type) = 'subsfxcategory'
            AND COALESCE(sf."imageUrl", '') <> ''
       ) ranked WHERE rn = 1`,
    );
    const categoryImageByTrack = new Map(catRows.map((r) => [r.trackId, r.imageUrl]));
    console.log(`✅ ${categoryImageByTrack.size} SFX tracks have a sub-category picture`);

    // ---- Index the buckets once ------------------------------------------
    console.log(`\n📦 Listing gs://${AUDIO_BUCKET}/sfxs/ ...`);
    const audioObjects = await gcsList(AUDIO_BUCKET, "sfxs/");
    console.log(`✅ ${audioObjects.size} audio objects`);

    console.log(`📦 Listing gs://${IMAGE_BUCKET}/sfxs/ ...`);
    const imageObjects = await gcsList(IMAGE_BUCKET, "sfxs/");
    console.log(`✅ ${imageObjects.size} image objects`);

    console.log(`📦 Listing gs://${IMAGE_BUCKET}/${ARTWORK_PREFIX} ...`);
    const artworkObjects = await gcsList(IMAGE_BUCKET, ARTWORK_PREFIX);
    console.log(`✅ ${artworkObjects.size} existing artwork tiles\n`);

    // ---- Snapshot before touching anything -------------------------------
    // Relative to the repo root, where the documented `npx ts-node scripts/...`
    // invocation runs from — __dirname is undefined when ts-node loads this as ESM.
    const backupDir = join(process.cwd(), "scripts", "backups");
    mkdirSync(backupDir, { recursive: true });
    const backupPath = join(
      backupDir,
      `sfx-assets-${DB_KEY}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`,
    );
    writeFileSync(
      backupPath,
      ["id,trackCode,artworkLink,mp3Link,waveformLink"]
        .concat(
          sfx.map((r) =>
            [r.id, r.trackCode, r.artworkLink ?? "", r.mp3Link ?? "", r.waveformLink ?? ""]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(","),
          ),
        )
        .join("\n"),
    );
    console.log(`💾 Pre-migration snapshot: ${backupPath}\n`);

    // ---- Per-track work ---------------------------------------------------
    let processed = 0;
    for (const track of sfx) {
      processed += 1;
      if (processed % 500 === 0) console.log(`⏳ ${processed}/${sfx.length} ...`);

      try {
        // Audio ------------------------------------------------------------
        const mp3Object = `sfxs/${track.id}/${track.id}-mp3.mp3`;
        if (audioObjects.has(mp3Object)) {
          if (isEmpty(track.mp3Link)) {
            if (!DRY_RUN) {
              await db.query(
                `UPDATE tracks SET "mp3Link" = $1, "updatedAt" = NOW()
                  WHERE id = $2 AND COALESCE("mp3Link", '') = ''`,
                [`${AUDIO_CDN_BASE}/${mp3Object}`, track.id],
              );
            }
            stats.mp3Linked += 1;
          }
        } else {
          stats.mp3Missing += 1;
        }

        // SFX waveforms sit under metaData/, unlike music's flat layout.
        const waveformObject = `sfxs/${track.id}/metaData/${track.id}-waveform.json`;
        if (audioObjects.has(waveformObject)) {
          if (isEmpty(track.waveformLink)) {
            if (!DRY_RUN) {
              await db.query(
                `UPDATE tracks SET "waveformLink" = $1, "updatedAt" = NOW()
                  WHERE id = $2 AND COALESCE("waveformLink", '') = ''`,
                [`${AUDIO_CDN_BASE}/${waveformObject}`, track.id],
              );
            }
            stats.waveformLinked += 1;
          }
        } else {
          stats.waveformMissing += 1;
        }

        // Artwork ------------------------------------------------------------
        if (!isEmpty(track.artworkLink)) {
          stats.artworkLeftAlone += 1;
          continue;
        }

        const destObject = `${ARTWORK_PREFIX}${track.trackCode}.webp`;
        const destUrl = `${IMAGE_CDN_BASE}/${destObject}`;
        const ownImage = IMAGE_EXTS.map((ext) => `sfxs/${track.id}/${track.id}-image.${ext}`).find(
          (name) => imageObjects.has(name),
        );

        let artworkUrl: string | null = null;

        if (artworkObjects.has(destObject)) {
          // A tile is already published under this trackCode — reuse it.
          stats.artworkAlreadyInBucket += 1;
          artworkUrl = destUrl;
        } else if (ownImage && !SKIP_UPLOADS) {
          if (!DRY_RUN) {
            const source = await gcsDownload(IMAGE_BUCKET, ownImage);
            const webp = await sharp(source).webp({ quality: 85 }).toBuffer();
            const written = await gcsUploadIfAbsent(IMAGE_BUCKET, destObject, webp, "image/webp");
            if (written) stats.artworkUploaded += 1;
            else stats.artworkAlreadyInBucket += 1;
          } else {
            stats.artworkUploaded += 1;
          }
          stats.artworkFromOwnImage += 1;
          artworkUrl = destUrl;
        } else if (categoryImageByTrack.has(track.id)) {
          // Point at the shared sub-category picture rather than copying one png
          // into thousands of per-trackCode objects. Edit the category art once
          // and every SFX under it follows.
          artworkUrl = reviveImageHost(categoryImageByTrack.get(track.id)!);
          stats.artworkFromCategory += 1;
        } else {
          stats.artworkNoSource += 1;
        }

        if (artworkUrl && !DRY_RUN) {
          await db.query(
            `UPDATE tracks SET "artworkLink" = $1, "updatedAt" = NOW()
              WHERE id = $2 AND COALESCE("artworkLink", '') = ''`,
            [artworkUrl, track.id],
          );
        }
      } catch (err) {
        stats.failed += 1;
        console.error(`❌ ${track.trackCode} (${track.id}): ${(err as Error).message}`);
      }
    }

    // ---- SFX sub-category pictures ---------------------------------------
    // Same objects, live host. Restricted to rows still naming the dead
    // CloudFront distribution, so anything already repointed is left alone.
    const { rows: deadSubFilters } = await db.query<{ id: string; imageUrl: string }>(
      `SELECT id, "imageUrl" FROM "subFilters"
        WHERE LOWER(type) = 'subsfxcategory' AND "imageUrl" LIKE $1`,
      [`${DEAD_IMAGE_HOST}/%`],
    );
    for (const sub of deadSubFilters) {
      if (!DRY_RUN) {
        await db.query(`UPDATE "subFilters" SET "imageUrl" = $1 WHERE id = $2`, [
          reviveImageHost(sub.imageUrl),
          sub.id,
        ]);
      }
      stats.subFilterHostsFixed += 1;
    }

    // ============ SUMMARY ============
    console.log("\n" + "=".repeat(62));
    console.log(`📊 SUMMARY — ${DB_KEY}${DRY_RUN ? " (dry run)" : ""}`);
    console.log("=".repeat(62));
    console.log(`🎧 SFX tracks considered:        ${stats.sfxRows}`);
    console.log(`✅ mp3Link set:                  ${stats.mp3Linked}`);
    console.log(`⚠️  mp3 absent from bucket:      ${stats.mp3Missing}`);
    console.log(`✅ waveformLink set:             ${stats.waveformLinked}`);
    console.log(`⚠️  waveform absent from bucket: ${stats.waveformMissing}`);
    console.log(`🖼️  artwork from own image:      ${stats.artworkFromOwnImage}`);
    console.log(`   ├─ webp tiles uploaded:       ${stats.artworkUploaded}`);
    console.log(`   └─ tile already in bucket:    ${stats.artworkAlreadyInBucket}`);
    console.log(`🖼️  artwork from sub-category:   ${stats.artworkFromCategory}`);
    console.log(`⚠️  no artwork source at all:    ${stats.artworkNoSource}`);
    console.log(`↩️  artworkLink already set:     ${stats.artworkLeftAlone}`);
    console.log(`🔗 sub-category hosts revived:   ${stats.subFilterHostsFixed}`);
    console.log(`❌ failed:                       ${stats.failed}`);
    console.log("=".repeat(62));
    console.log(`💾 Snapshot: ${backupPath}`);
    console.log("✨ Done!\n");
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
