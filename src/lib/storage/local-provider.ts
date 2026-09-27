import fs from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import {
  StorageService,
  UploadFileOptions,
  UploadResult,
  PresignedDownloadOptions,
  GetFileResult,
} from "./types";
import { computeSha256 } from "@/lib/storage-config";

/**
 * Local Disk Storage Provider (Fallback for local dev when S3 credentials are unset)
 * Stores files securely on the server disk, keeps them private, and generates signed download tokens.
 */
export class LocalDiskStorageProvider implements StorageService {
  readonly providerName = "LOCAL_DISK";
  private baseDir: string;
  private secretKey: string;

  constructor(baseDir?: string, secretKey?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), ".storage_uploads");
    this.secretKey = secretKey || process.env.AUTH_SECRET || "local-storage-signing-secret";
  }

  private getFilePath(key: string): string {
    // Prevent directory traversal
    const safeKey = key.replace(/\.\./g, "").replace(/^\/+/, "");
    return path.join(this.baseDir, safeKey);
  }

  async upload(options: UploadFileOptions): Promise<UploadResult> {
    const filePath = this.getFilePath(options.key);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, options.body);

    const checksum = computeSha256(options.body);

    return {
      key: options.key,
      checksum,
      sizeBytes: options.contentLength ?? options.body.length,
      etag: `"${checksum.slice(0, 16)}"`,
    };
  }

  async getSignedDownloadUrl(options: PresignedDownloadOptions): Promise<string> {
    const expiresIn = options.expiresInSeconds || 900;
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const filename = options.filename || options.key.split("/").pop() || "file";

    // Create HMAC signature
    const payload = `${options.key}:${expiresAt}:${filename}`;
    const signature = crypto.createHmac("sha256", this.secretKey).update(payload).digest("hex");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const cleanBase = baseUrl.replace(/\/+$/, "");

    const params = new URLSearchParams({
      key: options.key,
      exp: expiresAt.toString(),
      name: filename,
      sig: signature,
    });

    return `${cleanBase}/api/files/download?${params.toString()}`;
  }

  /**
   * Idempotent delete: a missing object counts as deleted (matches S3 semantics),
   * but any other failure is thrown so the cleanup job can record and retry it.
   */
  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }
  }

  async getFile(key: string): Promise<GetFileResult> {
    const filePath = this.getFilePath(key);
    if (!existsSync(filePath)) {
      throw new Error("File not found in local storage");
    }

    const stat = await fs.stat(filePath);
    const stream = createReadStream(filePath);

    return {
      stream,
      contentType: "application/octet-stream",
      contentLength: stat.size,
    };
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFilePath(key);
    return existsSync(filePath);
  }
}
