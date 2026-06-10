import { Storage } from "@google-cloud/storage";

interface GCSSignedUrlOptions {
  trackId: string;
  expiresInMinutes?: number;
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
  const { trackId, expiresInMinutes = 30 } = options;

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

  const bucketName = process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
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
