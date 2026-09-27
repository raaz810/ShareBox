import { Readable } from "stream";

export interface UploadFileOptions {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  etag?: string;
  checksum?: string;
  sizeBytes: number;
}

export interface PresignedDownloadOptions {
  key: string;
  expiresInSeconds?: number;
  filename?: string;
  contentType?: string;
}

export interface GetFileResult {
  stream: Readable | ReadableStream;
  contentType: string;
  contentLength?: number;
  etag?: string;
}

/**
 * Storage Service Abstraction (Requirement 1)
 * Isolates the storage provider logic from API routes and controllers.
 */
export interface StorageService {
  readonly providerName: string;

  /**
   * Uploads file binary data to the storage provider
   */
  upload(options: UploadFileOptions): Promise<UploadResult>;

  /**
   * Generates a temporary signed URL for private object download (Requirement 12 & 13)
   */
  getSignedDownloadUrl(options: PresignedDownloadOptions): Promise<string>;

  /**
   * Deletes an object from storage
   */
  delete(key: string): Promise<void>;

  /**
   * Retrieves file stream (useful for proxy streaming or fallback downloads)
   */
  getFile(key: string): Promise<GetFileResult>;

  /**
   * Checks if an object exists in storage
   */
  exists(key: string): Promise<boolean>;
}
