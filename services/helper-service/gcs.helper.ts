import { Storage } from "@google-cloud/storage";

interface GCSSignedUrlOptions {
  filePath: string; // GCS object path, e.g. "musics/xyz/xyz-mp3.mp3"
  expiresInMinutes?: number;
}

interface GCSSignedUrlResult {
  filename: string;
  downloadLink: string;
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
  const { filePath, expiresInMinutes = 30 } = options;

  const bucketName = process.env.SELECT_BUCKET;
  if (!bucketName) {
    throw new Error("Missing SELECT_BUCKET environment variable");
  }

  const storage = getStorageInstance();

  // Extract object path if a full URL was provided
  // e.g. "https://storage.googleapis.com/bucket/musics/..." → "musics/..."
  let gcsFilePath = filePath;
  if (filePath.startsWith("https://") || filePath.startsWith("http://")) {
    const url = new URL(filePath);
    // pathname is like /bucketName/object/path — strip the leading /bucketName/
    gcsFilePath = url.pathname.replace(/^\/[^/]+\//, "");
  }

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
    responseDisposition: `attachment; filename="${gcsFilePath.split("/").pop()}"`,
  });

  return {
    filename: gcsFilePath,
    downloadLink: signedUrl,
  };
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
