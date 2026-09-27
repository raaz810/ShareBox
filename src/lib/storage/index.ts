import { StorageService } from "./types";
import { S3StorageProvider } from "./s3-provider";
import { LocalDiskStorageProvider } from "./local-provider";

let storageInstance: StorageService | null = null;

/**
 * Gets or initializes the active storage provider.
 * Uses Cloudflare R2 / AWS S3 if valid credentials are present in env,
 * or gracefully falls back to private server-side disk storage for local dev.
 */
export function getStorageService(): StorageService {
  if (storageInstance) {
    return storageInstance;
  }

  const endpoint = process.env.STORAGE_ENDPOINT;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY;
  const secretAccessKey = process.env.STORAGE_SECRET_KEY;
  const bucket = process.env.STORAGE_BUCKET;
  const region = process.env.STORAGE_REGION || "auto";

  const isConfiguredS3 =
    Boolean(endpoint && accessKeyId && secretAccessKey && bucket) &&
    !accessKeyId?.includes("placeholder") &&
    !secretAccessKey?.includes("placeholder") &&
    !bucket?.includes("placeholder");

  if (isConfiguredS3) {
    storageInstance = new S3StorageProvider({
      endpoint: endpoint!,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      bucket: bucket!,
      region,
      forcePathStyle: true,
    });
  } else {
    storageInstance = new LocalDiskStorageProvider();
  }

  return storageInstance;
}

export const storageService = getStorageService();
export * from "./types";
export * from "./s3-provider";
export * from "./local-provider";
