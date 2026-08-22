import { Storage } from "@google-cloud/storage";

interface GCSSignedUrlOptions {
  trackId: string;
  expiresInMinutes?: number;
  // SFX audio lives in a separate stream-source bucket (SFX_BUCKET) under
  // sfxs/{trackId}/... instead of SELECT_BUCKET's musics/{trackId}/...
  isSfx?: boolean;
}

interface GCSSignedUrlResult {
  filename: string;
  downloadLink: string;
}

interface GCSPreviewSignedUrlOptions {
  trackId: string;
  expiresInSeconds?: number;
}

interface GCSPreviewSignedUrlResult {
  previewUrl: string;
  expiresInSeconds: number;
}

let storageInstance: Storage | null = null;

const getStorageInstance = (): Storage => {
  if (storageInstance) {
    return storageInstance;
  }

  const gcpProjectId = process.env.GCP_PROJECT_ID;
  const serviceAccountJson = process.env.GCP_SA_KEY_JSON;

  if (!gcpProjectId || !serviceAccountJson) {
    throw new Error("Missing required GCP environment variables (GCP_PROJECT_ID or GCP_SA_KEY_JSON)");
  }

  let credentials;
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch (jsonError) {
    throw new Error("Invalid GCP_SA_KEY_JSON format");
  }

  storageInstance = new Storage({
    projectId: gcpProjectId,
    credentials: credentials,
  });

  return storageInstance;
};

export const generateGCSSignedUrl = async (
  options: GCSSignedUrlOptions
): Promise<GCSSignedUrlResult> => {
  const { trackId, expiresInMinutes = 30, isSfx = false } = options;

  const bucketName = isSfx ? process.env.SFX_BUCKET : process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error(
      `Missing ${isSfx ? "SFX_BUCKET" : "SELECT_BUCKET"} environment variable`,
    );
  }

  const storage = getStorageInstance();
  const gcsFilePath = isSfx
    ? `sfxs/${trackId}/${trackId}-mp3.mp3`
    : `musics/${trackId}/${trackId}-mp3.mp3`;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsFilePath);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found in GCS: gs://${bucketName}/${gcsFilePath}`);
  }

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    responseType: "audio/mpeg",
    responseDisposition: `attachment; filename="${trackId}-mp3.mp3"`,
  });

  return {
    filename: gcsFilePath,
    downloadLink: signedUrl,
  };
};

interface GetGCSSignedUrlOptions {
  gcsPath: string;
  contentType?: string;
  expiresInMinutes?: number;
}

export const getGCSSignedUrl = async (
  options: GetGCSSignedUrlOptions
): Promise<string | null> => {
  const { gcsPath, contentType = "application/pdf", expiresInMinutes = 30 } = options;

  const bucketName = process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
  }

  const storage = getStorageInstance();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsPath);

  const [exists] = await file.exists();
  if (!exists) {
    return null;
  }

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    responseType: contentType,
  });

  return signedUrl;
};

interface UploadBufferOptions {
  buffer: Buffer;
  gcsPath: string;
  contentType: string;
  expiresInMinutes?: number;
}

export const uploadBufferToGCS = async (
  options: UploadBufferOptions
): Promise<string> => {
  const { buffer, gcsPath, contentType, expiresInMinutes = 30 } = options;

  const bucketName = process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
  }

  const storage = getStorageInstance();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsPath);

  await file.save(buffer, { contentType });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    responseType: contentType,
  });

  return signedUrl;
};

interface UploadPublicImageOptions {
  buffer: Buffer;
  // Object path within the bucket, e.g. "web/playlists/<code>.webp".
  gcsPath: string;
  contentType: string;
}

/**
 * Upload an image to the public CDN bucket and return its permanent public URL.
 *
 * Unlike uploadBufferToGCS (which returns an expiring signed URL), this is for
 * assets the consumer site loads directly. The bucket has uniform bucket-level
 * public access, so saving the object is enough — no per-object ACL call. The
 * returned URL is built from CDN_BASE_URL (env-configurable per environment) so
 * dev/prod resolve to the correct CDN host without code changes.
 */
export const uploadPublicImageToGCS = async (
  options: UploadPublicImageOptions
): Promise<string> => {
  const { buffer, gcsPath, contentType } = options;

  // Playlist images live in a dedicated public bucket, separate from the
  // SELECT_BUCKET used by the rest of GCS functionality.
  const bucketName = process.env.CDN_UNIFIED_BUCKET;
  if (!bucketName) {
    throw new Error("Missing CDN_UNIFIED_BUCKET environment variable");
  }

  const cdnBaseUrl = process.env.CDN_BASE_URL;
  if (!cdnBaseUrl) {
    throw new Error("Missing CDN_BASE_URL environment variable");
  }

  const storage = getStorageInstance();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsPath);

  // Overwrites any existing object at this path (callers cache-bust via a
  // version query param on the saved URL). cacheControl is short so the CDN
  // re-validates replaced covers reasonably quickly.
  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: "public, max-age=300" },
  });

  const base = cdnBaseUrl.replace(/\/+$/, "");
  const path = gcsPath.replace(/^\/+/, "");
  return `${base}/${path}`;
};

/**
 * Generate a short-lived signed URL for track preview (expires in seconds)
 * Used for public APIs that need time-limited access to audio files
 */
export const generateGCSPreviewSignedUrl = async (
  options: GCSPreviewSignedUrlOptions
): Promise<GCSPreviewSignedUrlResult> => {
  const { trackId, expiresInSeconds = 30 } = options;

  const bucketName = process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
  }

  const storage = getStorageInstance();
  const gcsFilePath = `musics/${trackId}/${trackId}-mp3.mp3`;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsFilePath);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found in GCS: gs://${bucketName}/${gcsFilePath}`);
  }

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInSeconds * 1000,
    responseType: "audio/mpeg",
  });

  return {
    previewUrl: signedUrl,
    expiresInSeconds,
  };
};

// ~600KB covers 15 seconds at 320kbps (highest common MP3 bitrate)
const PREVIEW_BYTE_LIMIT = 614400;

interface StreamPreviewOptions {
  trackId: string;
}

/**
 * Stream the first ~15 seconds of a track (limited to ~600KB)
 * Returns a readable stream with only the preview portion
 */
export const createPreviewStream = async (
  options: StreamPreviewOptions
): Promise<{ stream: NodeJS.ReadableStream; contentLength: number } | null> => {
  const { trackId } = options;

  const bucketName = process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
  }

  const storage = getStorageInstance();
  const gcsFilePath = `musics/${trackId}/${trackId}-mp3.mp3`;

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(gcsFilePath);

  const [exists] = await file.exists();
  if (!exists) {
    return null;
  }

  // Get file metadata to determine actual content length
  const [metadata] = await file.getMetadata();
  const fileSize = parseInt(metadata.size as string, 10);
  const contentLength = Math.min(fileSize, PREVIEW_BYTE_LIMIT);

  // Create a read stream limited to preview bytes only
  // This means server only downloads ~600KB from GCS, not the full file
  const stream = file.createReadStream({
    start: 0,
    end: contentLength - 1,
  });

  return { stream, contentLength };
};

// ── Stem audio ──────────────────────────────────────────────────────────────
//
// Stems sit one level below the master, keyed by the stem's TYPE rather than by
// any id:
//
//   musics/<assetTrackId>/stems/<stemType>-mp3.mp3                 — audio
//   musics/<assetTrackId>/stems/metaData/<stemType>-waveform.json  — waveform
//
// Two traps, both of which serve 404s if got wrong (see NATIVE-BE's
// gcs.helper, which serves the same objects for creator-web):
//
//  1. `assetTrackId` is the LEGACY hoopr track uuid (creator_stems.legacy_track_id),
//     NOT the sage `tracks.id` the row is bridged to. The migration re-keyed the
//     catalogue but the bucket was never re-laid-out, so every migrated stem
//     object still lives under the old uuid. Only rows ingested natively after
//     the migration have the two agree, and there `legacy_track_id` is null.
//  2. `stemType` is used verbatim, original case and spaces included
//     ("Supporting Elements", "Acoustic Guitar"). It is neither slugified nor
//     lowercased — `name_slug` is a display field and does NOT name the object.
//
// NOTE the deliberate difference from generateGCSSignedUrl above: that routes
// SFX to SFX_BUCKET, whereas stem objects for both types live in SELECT_BUCKET
// (only the prefix changes). Stems are a music feature in practice, so this
// branch is near-dead code either way, but it matches where the objects are.

/** The bucket/CDN path segment for a stem's audio, given its asset track id. */
export const stemObjectPath = (
  assetTrackId: string,
  stemType: string,
  isSfx = false,
): string =>
  `${isSfx ? "sfxs" : "musics"}/${assetTrackId}/stems/${stemType}-mp3.mp3`;

/** The path segment for a stem's waveform json. */
export const stemWaveformPath = (
  assetTrackId: string,
  stemType: string,
  isSfx = false,
): string =>
  `${isSfx ? "sfxs" : "musics"}/${assetTrackId}/stems/metaData/${stemType}-waveform.json`;

/**
 * Read an object into memory.
 *
 * Returns null when the object isn't there, so a bundle can skip one missing
 * stem instead of failing the whole download. `bucket` defaults to
 * SELECT_BUCKET; pass SFX_BUCKET explicitly for SFX masters.
 */
export const downloadGCSObject = async (options: {
  gcsPath: string;
  bucketName?: string;
}): Promise<Buffer | null> => {
  const bucketName = options.bucketName ?? process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
  }

  const file = getStorageInstance().bucket(bucketName).file(options.gcsPath);

  const [exists] = await file.exists();
  if (!exists) {
    return null;
  }

  const [buffer] = await file.download();
  return buffer;
};

/**
 * Signed read URL for an object that already exists, with the size and any
 * custom metadata the writer stored alongside it.
 *
 * Used for the stem bundle cache: one call answers "is it built?", "how big?"
 * and "how many files?" without a second round trip.
 */
export const getGCSObjectWithMetadata = async (options: {
  gcsPath: string;
  contentType?: string;
  expiresInMinutes?: number;
  downloadName?: string;
}): Promise<{
  downloadLink: string;
  sizeBytes: number;
  metadata: Record<string, string>;
} | null> => {
  const {
    gcsPath,
    contentType = "application/zip",
    expiresInMinutes = 30,
    downloadName,
  } = options;

  const bucketName = process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
  }

  const file = getStorageInstance().bucket(bucketName).file(gcsPath);

  const [exists] = await file.exists();
  if (!exists) {
    return null;
  }

  const [meta] = await file.getMetadata();

  const [downloadLink] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMinutes * 60 * 1000,
    responseType: contentType,
    ...(downloadName && {
      responseDisposition: `attachment; filename="${downloadName}"`,
    }),
  });

  return {
    downloadLink,
    sizeBytes: Number(meta.size ?? 0),
    metadata: (meta.metadata ?? {}) as Record<string, string>,
  };
};

/**
 * Write an object with custom metadata attached. Mirrors uploadBufferToGCS but
 * returns nothing — the caller signs a URL separately via
 * getGCSObjectWithMetadata so the read path is identical whether the object was
 * just built or was already cached.
 */
export const uploadBufferWithMetadata = async (options: {
  buffer: Buffer;
  gcsPath: string;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<void> => {
  const bucketName = process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
  }

  const file = getStorageInstance().bucket(bucketName).file(options.gcsPath);
  await file.save(options.buffer, {
    contentType: options.contentType,
    ...(options.metadata && { metadata: { metadata: options.metadata } }),
  });
};
