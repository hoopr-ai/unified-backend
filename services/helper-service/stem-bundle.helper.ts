import { createHash } from "crypto";
import PizZip from "pizzip";
import {
  downloadGCSObject,
  getGCSObjectWithMetadata,
  stemObjectPath,
  uploadBufferWithMetadata,
} from "./gcs.helper";
import { logger } from "./logger";

/**
 * The "mix + every stem" zip an enterprise brand downloads when it ticks
 * "Include stems".
 *
 * Bundles are built once per track and cached in SELECT_BUCKET, so only the
 * first downloader of a given track pays the build cost. The cache key carries
 * a fingerprint of the stem set, so re-ingesting or soft-deleting a stem
 * invalidates the old zip instead of serving a stale one forever.
 */

export interface StemBundleStem {
  /** The id the BUCKET is keyed by — legacy_track_id, falling back to track_id. */
  assetTrackId: string;
  /** Verbatim creator_stems.stem_type, e.g. "Supporting Elements". */
  stemType: string;
}

export interface StemBundleInput {
  /** Sage tracks.id. Names the mix object and the cache path. */
  trackId: string;
  trackName: string;
  isSfx: boolean;
  stems: StemBundleStem[];
}

export interface StemBundleResult {
  downloadLink: string;
  /** Files actually inside the zip — mix included, missing stems excluded. */
  fileCount: number;
  sizeBytes: number;
}

/**
 * Safe for a zip entry name and for a quoted Content-Disposition filename: no
 * quotes, backslashes, path separators, control characters or non-ASCII (which
 * browsers mangle). A path separator here would silently create a folder inside
 * the archive.
 */
const safeFilename = (name: string): string =>
  name
    .replace(/[^ -~]/g, "")
    .replace(/["\\/:*?<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Where the built zip is cached. Keyed by the sage track id. */
export const stemBundlePath = (trackId: string): string =>
  `stem-bundles/${trackId}/${trackId}-stems.zip`;

/** The name the browser saves the zip as. */
const bundleDownloadName = (input: StemBundleInput): string =>
  `${safeFilename(input.trackName) || input.trackId}.zip`;

/**
 * Identifies the stem set a cached zip was built from. Any change to the number
 * of stems, their types, or the asset ids they resolve to produces a different
 * value, which is what makes a rebuild happen instead of a stale hit.
 */
const stemFingerprint = (input: StemBundleInput): string =>
  createHash("sha1")
    .update(
      input.stems
        .map((s) => `${s.assetTrackId}/${s.stemType}`)
        .sort()
        .join("\n"),
    )
    .digest("hex");

/** The mix object, laid out exactly as generateGCSSignedUrl expects it. */
const mixObject = (
  input: StemBundleInput,
): { gcsPath: string; bucketName?: string } =>
  input.isSfx
    ? {
        gcsPath: `sfxs/${input.trackId}/${input.trackId}-mp3.mp3`,
        bucketName: process.env.SFX_BUCKET,
      }
    : { gcsPath: `musics/${input.trackId}/${input.trackId}-mp3.mp3` };

/**
 * A cached bundle for this exact stem set, or null if it hasn't been built (or
 * was built from a different stem set and must be rebuilt).
 */
export const readCachedStemBundle = async (
  input: StemBundleInput,
): Promise<StemBundleResult | null> => {
  const cached = await getGCSObjectWithMetadata({
    gcsPath: stemBundlePath(input.trackId),
    contentType: "application/zip",
    downloadName: bundleDownloadName(input),
  });
  if (!cached) return null;

  if (cached.metadata.stemFingerprint !== stemFingerprint(input)) {
    logger.info(
      `[StemBundle] Cache for track ${input.trackId} was built from a different stem set — rebuilding`,
    );
    return null;
  }

  return {
    downloadLink: cached.downloadLink,
    fileCount: Number(cached.metadata.fileCount ?? 0),
    sizeBytes: cached.sizeBytes,
  };
};

/**
 * Build the zip and cache it, then return a link to it.
 *
 * mp3 is already compressed, so entries are STOREd: DEFLATE would spend CPU and
 * memory to save almost nothing on audio.
 *
 * A stem whose object is missing is skipped with a warning rather than failing
 * the download — one bad row should not deny the brand the licence it paid for.
 * A missing MIX does throw, because a "track + stems" zip without the track is
 * not what was asked for.
 */
export const buildStemBundle = async (
  input: StemBundleInput,
): Promise<StemBundleResult> => {
  const { gcsPath: mixPath, bucketName: mixBucket } = mixObject(input);
  const mix = await downloadGCSObject({
    gcsPath: mixPath,
    bucketName: mixBucket,
  });
  if (!mix) {
    throw new Error(`Mix audio not found in GCS: ${mixPath}`);
  }

  const zip = new PizZip();
  const baseName = safeFilename(input.trackName) || input.trackId;
  zip.file(`${baseName}.mp3`, mix);
  let fileCount = 1;

  // Sequential rather than Promise.all: a 20-stem track would otherwise hold 20
  // full mp3s plus the growing archive in memory at once.
  for (const stem of input.stems) {
    const gcsPath = stemObjectPath(stem.assetTrackId, stem.stemType, input.isSfx);
    const buffer = await downloadGCSObject({ gcsPath });
    if (!buffer) {
      logger.warn(
        `[StemBundle] Skipping missing stem object for track ${input.trackId}: ${gcsPath}`,
      );
      continue;
    }
    // Named so every file stays distinguishable once they're all in one folder.
    const stemName = safeFilename(stem.stemType);
    zip.file(`${baseName}${stemName ? ` - ${stemName}` : ""}.mp3`, buffer);
    fileCount += 1;
  }

  const archive = zip.generate({ type: "nodebuffer", compression: "STORE" });

  await uploadBufferWithMetadata({
    buffer: archive,
    gcsPath: stemBundlePath(input.trackId),
    contentType: "application/zip",
    metadata: {
      fileCount: String(fileCount),
      stemFingerprint: stemFingerprint(input),
    },
  });

  logger.info(
    `[StemBundle] Built bundle for track ${input.trackId}: ${fileCount} files, ${archive.length} bytes`,
  );

  const cached = await readCachedStemBundle(input);
  if (!cached) {
    // The object was just written, so this only happens if the write silently
    // didn't land. Better to say so than to hand back a link to nothing.
    throw new Error(
      `Stem bundle for track ${input.trackId} was not readable after upload`,
    );
  }
  return cached;
};
