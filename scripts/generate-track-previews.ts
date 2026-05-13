/**
 * Script: Generate Track Previews
 *
 * Generates preview clips for ACTIVE tracks and uploads them to GCS.
 *
 * Preview selection logic:
 * - If hookTimings exist: pick the first chorus with duration >= 20s.
 *   If none qualify, use the longest chorus.
 *   Preview starts 1s before the chosen chorus (clamped to 0) and runs
 *   for min(30s, max(20s, chorusDuration)).
 * - If hookTimings is missing/empty: fall back to the first 20s of the track.
 * - A 2-second fade-out is applied at the end of every preview.
 *
 * Prerequisites:
 * - FFmpeg must be installed and available in PATH
 * - .env loaded with: GCP_PROJECT_ID, GCP_SA_KEY_JSON, and either
 *   DATABASE_URL or the split DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT vars
 *
 * Usage:
 *   npx ts-node scripts/generate-track-previews.ts
 *
 * Options:
 *   --dry-run         Preview what would be done without making changes
 *   --limit=N         Process only first N tracks
 *   --force           Regenerate previews even if they already exist
 *   --concurrency=N   Number of tracks to process in parallel (default: 5)
 */

import { config } from "dotenv";
import { Storage } from "@google-cloud/storage";
import { Sequelize, QueryTypes } from "sequelize";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

config();

const execAsync = promisify(exec);

// Configuration
const MIN_PREVIEW_DURATION = 20;
const MAX_PREVIEW_DURATION = 30;
const FALLBACK_PREVIEW_DURATION = 20;
const FADE_OUT_DURATION = 2;
const HOOK_LEAD_IN_SECONDS = 1;
const PREVIEW_BITRATE = "128k";
const DEFAULT_CONCURRENCY = 5;

interface HookTiming {
  start: number;
  end: number;
  label: string;
}

interface Track {
  id: string;
  trackCode: string;
  name: string;
  previewLink: string | null;
  hookTimings: HookTiming[] | null;
}

interface PreviewWindow {
  startSeconds: number;
  durationSeconds: number;
  source: "hook" | "fallback";
  hookLabel?: string;
}

interface ProcessResult {
  trackId: string;
  trackCode: string;
  success: boolean;
  error?: string;
  previewPath?: string;
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const forceRegenerate = args.includes("--force");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
const concurrencyArg = args.find((arg) => arg.startsWith("--concurrency="));
const concurrency = concurrencyArg
  ? Math.max(1, parseInt(concurrencyArg.split("=")[1], 10) || DEFAULT_CONCURRENCY)
  : DEFAULT_CONCURRENCY;

// Initialize GCS Storage
function getStorageInstance(): Storage {
  const gcpProjectId = process.env.GCP_PROJECT_ID;
  const serviceAccountJson = process.env.GCP_SA_KEY_JSON;

  if (!gcpProjectId || !serviceAccountJson) {
    throw new Error("Missing GCP_PROJECT_ID or GCP_SA_KEY_JSON environment variables");
  }

  const credentials = JSON.parse(serviceAccountJson);
  return new Storage({
    projectId: gcpProjectId,
    credentials,
  });
}

// Initialize Sequelize using either DATABASE_URL or split DB_* env vars (matches the rest of the project).
function getSequelizeInstance(): Sequelize {
  const sslOptions = {
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  };

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return new Sequelize(databaseUrl, {
      logging: false,
      dialect: "postgres",
      ...sslOptions,
    });
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432;

  if (!host || !user || !password || !database) {
    throw new Error(
      "Missing database credentials. Set DATABASE_URL, or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME"
    );
  }

  return new Sequelize(database, user, password, {
    host,
    port,
    dialect: "postgres",
    logging: false,
    ...sslOptions,
  });
}

// Fetch tracks that need previews generated
async function fetchTracksForPreview(sequelize: Sequelize): Promise<Track[]> {
  const query = `
    SELECT t.id, t."trackCode", t.name, t."previewLink", t."hookTimings"
    FROM tracks t
    WHERE t.status = 'ACTIVE'
      ${forceRegenerate ? "" : 'AND t."previewLink" IS NULL'}
    ORDER BY t."createdAt" DESC
    ${limit ? `LIMIT ${limit}` : ""}
  `;

  const tracks = await sequelize.query<Track>(query, {
    type: QueryTypes.SELECT,
  });

  return tracks;
}

// Parse hookTimings JSONB into a typed array of chorus entries.
// Returns null when the field is missing, malformed, or has no chorus_* labels.
function parseChorusHooks(raw: unknown): HookTiming[] | null {
  if (!Array.isArray(raw)) return null;

  const choruses: HookTiming[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { start, end, label } = item as Record<string, unknown>;
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      typeof label === "string" &&
      label.toLowerCase().startsWith("chorus") &&
      end > start
    ) {
      choruses.push({ start, end, label });
    }
  }

  return choruses.length > 0 ? choruses : null;
}

// Choose the preview window for a track.
// - First chorus with duration >= MIN_PREVIEW_DURATION wins.
// - If none qualify, the longest chorus is used.
// - Preview starts HOOK_LEAD_IN_SECONDS before the chosen chorus, clamped to 0.
// - Duration = clamp(chorusDuration, MIN_PREVIEW_DURATION, MAX_PREVIEW_DURATION).
// - If no usable hook data, falls back to the first FALLBACK_PREVIEW_DURATION seconds.
function choosePreviewWindow(hookTimings: unknown): PreviewWindow {
  const choruses = parseChorusHooks(hookTimings);
  if (!choruses) {
    return {
      startSeconds: 0,
      durationSeconds: FALLBACK_PREVIEW_DURATION,
      source: "fallback",
    };
  }

  // Sort by chronological start to make "first chorus >= 20s" deterministic.
  const orderedByStart = [...choruses].sort((a, b) => a.start - b.start);
  const firstLongEnough = orderedByStart.find(
    (c) => c.end - c.start >= MIN_PREVIEW_DURATION
  );

  const chosen =
    firstLongEnough ??
    choruses.reduce((longest, current) =>
      current.end - current.start > longest.end - longest.start ? current : longest
    );

  const chorusDuration = chosen.end - chosen.start;
  const durationSeconds = Math.min(
    MAX_PREVIEW_DURATION,
    Math.max(MIN_PREVIEW_DURATION, chorusDuration)
  );
  const startSeconds = Math.max(0, chosen.start - HOOK_LEAD_IN_SECONDS);

  return {
    startSeconds,
    durationSeconds,
    source: "hook",
    hookLabel: chosen.label,
  };
}

// Check if FFmpeg is installed
async function checkFFmpegInstalled(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

// Download file from GCS to local temp directory
async function downloadFromGCS(
  storage: Storage,
  bucketName: string,
  gcsPath: string,
  localPath: string
): Promise<void> {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsPath);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found in GCS: ${gcsPath}`);
  }

  await file.download({ destination: localPath });
}

// Generate preview using FFmpeg
async function generatePreview(
  inputPath: string,
  outputPath: string,
  window: PreviewWindow
): Promise<void> {
  const fadeStart = Math.max(0, window.durationSeconds - FADE_OUT_DURATION);
  // -ss before -i seeks fast on the input; -t caps duration; afade applies the tail fade.
  const command =
    `ffmpeg -y -ss ${window.startSeconds} -i "${inputPath}" ` +
    `-t ${window.durationSeconds} -b:a ${PREVIEW_BITRATE} ` +
    `-af "afade=t=out:st=${fadeStart}:d=${FADE_OUT_DURATION}" "${outputPath}"`;

  try {
    await execAsync(command);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`FFmpeg failed: ${errorMessage}`);
  }
}

// Upload preview to GCS
async function uploadToGCS(
  storage: Storage,
  bucketName: string,
  localPath: string,
  gcsPath: string
): Promise<void> {
  const bucket = storage.bucket(bucketName);
  await bucket.upload(localPath, {
    destination: gcsPath,
    contentType: "audio/mpeg",
    metadata: {
      cacheControl: "public, max-age=31536000", // Cache for 1 year
    },
  });
}

// Update track with preview link
async function updateTrackPreviewLink(
  sequelize: Sequelize,
  trackId: string,
  previewLink: string
): Promise<void> {
  await sequelize.query(
    `UPDATE tracks SET "previewLink" = :previewLink, "updatedAt" = NOW() WHERE id = :trackId`,
    {
      replacements: { previewLink, trackId },
      type: QueryTypes.UPDATE,
    }
  );
}

// Process a single track
async function processTrack(
  track: Track,
  storage: Storage,
  sequelize: Sequelize,
  bucketName: string
): Promise<ProcessResult> {
  const tempDir = os.tmpdir();
  const inputPath = path.join(tempDir, `${track.id}-original.mp3`);
  const outputPath = path.join(tempDir, `${track.id}-preview.mp3`);
  const gcsSourcePath = `musics/${track.id}/${track.id}-mp3.mp3`;
  const gcsPreviewPath = `previews/${track.id}.mp3`;

  const window = choosePreviewWindow(track.hookTimings);
  const windowDescription =
    window.source === "hook"
      ? `${window.durationSeconds}s @ ${window.startSeconds.toFixed(2)}s (${window.hookLabel})`
      : `${window.durationSeconds}s @ 0s (fallback - no hookTimings)`;

  try {
    if (isDryRun) {
      console.log(
        `[DRY RUN] Would process: ${track.trackCode} - ${track.name} | preview: ${windowDescription}`
      );
      return {
        trackId: track.id,
        trackCode: track.trackCode,
        success: true,
        previewPath: gcsPreviewPath,
      };
    }

    console.log(`Processing: ${track.trackCode} - ${track.name}`);

    // Step 1: Download original from GCS
    console.log(`  Downloading from GCS...`);
    await downloadFromGCS(storage, bucketName, gcsSourcePath, inputPath);

    // Step 2: Generate preview with FFmpeg
    console.log(`  Generating preview: ${windowDescription}...`);
    await generatePreview(inputPath, outputPath, window);

    // Step 3: Upload preview to GCS
    console.log(`  Uploading preview to GCS...`);
    await uploadToGCS(storage, bucketName, outputPath, gcsPreviewPath);

    // Step 4: Update database
    console.log(`  Updating database...`);
    await updateTrackPreviewLink(sequelize, track.id, gcsPreviewPath);

    console.log(`  Done!`);

    return {
      trackId: track.id,
      trackCode: track.trackCode,
      success: true,
      previewPath: gcsPreviewPath,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`  Error (${track.trackCode}): ${errorMessage}`);
    return {
      trackId: track.id,
      trackCode: track.trackCode,
      success: false,
      error: errorMessage,
    };
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Process tracks in batches with concurrency
async function processTracksInBatches(
  tracks: Track[],
  storage: Storage,
  sequelize: Sequelize,
  bucketName: string
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];

  for (let i = 0; i < tracks.length; i += concurrency) {
    const batch = tracks.slice(i, i + concurrency);
    const batchNumber = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(tracks.length / concurrency);

    console.log(`\n--- Batch ${batchNumber}/${totalBatches} ---`);

    const batchResults = await Promise.all(
      batch.map((track) => processTrack(track, storage, sequelize, bucketName))
    );

    results.push(...batchResults);
  }

  return results;
}

// Main function
async function main(): Promise<void> {
  console.log("=== Track Preview Generator ===\n");

  if (isDryRun) {
    console.log("Running in DRY RUN mode - no changes will be made\n");
  }

  console.log(`Concurrency: ${concurrency}`);
  if (forceRegenerate) {
    console.log("Force mode: ON - existing previews will be regenerated");
  }
  if (limit) {
    console.log(`Limit: ${limit} tracks`);
  }

  // Check FFmpeg
  const ffmpegInstalled = await checkFFmpegInstalled();
  if (!ffmpegInstalled) {
    console.error("Error: FFmpeg is not installed or not in PATH");
    console.error("Please install FFmpeg: https://ffmpeg.org/download.html");
    process.exit(1);
  }
  console.log("FFmpeg: OK");

  // Initialize connections
  const bucketName = "unified_backend_prod";
  if (!bucketName) {
    console.error("Error: Missing SELECT_BUCKET environment variable");
    process.exit(1);
  }
  console.log(`GCS Bucket: ${bucketName}`);

  const storage = getStorageInstance();
  console.log("GCS Storage: OK");

  const sequelize = getSequelizeInstance();
  await sequelize.authenticate();
  console.log("Database: OK\n");

  // Fetch tracks
  console.log("Fetching tracks...");
  const tracks = await fetchTracksForPreview(sequelize);
  console.log(`Found ${tracks.length} tracks to process\n`);

  if (tracks.length === 0) {
    console.log("No tracks need preview generation. Done!");
    await sequelize.close();
    return;
  }

  // Process tracks
  const results = await processTracksInBatches(tracks, storage, sequelize, bucketName);

  // Summary
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log("\n=== Summary ===");
  console.log(`Total processed: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed tracks:");
    failed.forEach((r) => {
      console.log(`  - ${r.trackCode}: ${r.error}`);
    });
  }

  await sequelize.close();
  console.log("\nDone!");
}

// Run the script
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
