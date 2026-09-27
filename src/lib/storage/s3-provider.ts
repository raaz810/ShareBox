import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import {
  StorageService,
  UploadFileOptions,
  UploadResult,
  PresignedDownloadOptions,
  GetFileResult,
} from "./types";
import { computeSha256 } from "@/lib/storage-config";

export interface S3ProviderConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region?: string;
  forcePathStyle?: boolean;
}

/**
 * Cloudflare R2 / AWS S3 / S3-Compatible Storage Provider
 * Keeps bucket private and issues temporary signed download URLs (Requirements 1, 12, 13)
 */
export class S3StorageProvider implements StorageService {
  readonly providerName = "S3_COMPATIBLE";
  private client: S3Client;
  private bucket: string;

  constructor(config: S3ProviderConfig) {
    this.bucket = config.bucket;

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "auto",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
    });
  }

  async upload(options: UploadFileOptions): Promise<UploadResult> {
    const checksum = computeSha256(options.body);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      Body: options.body,
      ContentType: options.contentType,
      ContentLength: options.contentLength ?? options.body.length,
      Metadata: options.metadata || {},
    });

    const res = await this.client.send(command);

    return {
      key: options.key,
      etag: res.ETag,
      checksum,
      sizeBytes: options.contentLength ?? options.body.length,
    };
  }

  async getSignedDownloadUrl(options: PresignedDownloadOptions): Promise<string> {
    const expiresIn = options.expiresInSeconds || 900; // default 15 minutes
    const filename = options.filename || options.key.split("/").pop() || "file";

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
      ResponseContentType: options.contentType,
    });

    return await getSignedUrl(this.client, command, { expiresIn });
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }

  async getFile(key: string): Promise<GetFileResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const res = await this.client.send(command);

    return {
      stream: res.Body as Readable,
      contentType: res.ContentType || "application/octet-stream",
      contentLength: res.ContentLength,
      etag: res.ETag,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}
