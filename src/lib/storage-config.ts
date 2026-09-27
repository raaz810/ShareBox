import crypto from "crypto";

export interface AllowedTypeConfig {
  mime: string;
  category: "image" | "document" | "video" | "archive";
  extensions: string[];
}

/**
 * Whitelist of allowed MIME types and file extensions (Requirement 8)
 */
export const ALLOWED_FILE_TYPES: Record<string, AllowedTypeConfig> = {
  // Images: JPG, JPEG, PNG, GIF, WEBP, SVG
  "image/jpeg": { mime: "image/jpeg", category: "image", extensions: ["jpg", "jpeg"] },
  "image/png": { mime: "image/png", category: "image", extensions: ["png"] },
  "image/gif": { mime: "image/gif", category: "image", extensions: ["gif"] },
  "image/webp": { mime: "image/webp", category: "image", extensions: ["webp"] },
  "image/svg+xml": { mime: "image/svg+xml", category: "image", extensions: ["svg"] },

  // Documents: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV
  "application/pdf": { mime: "application/pdf", category: "document", extensions: ["pdf"] },
  "application/msword": { mime: "application/msword", category: "document", extensions: ["doc"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "document",
    extensions: ["docx"],
  },
  "application/vnd.ms-excel": { mime: "application/vnd.ms-excel", category: "document", extensions: ["xls"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    category: "document",
    extensions: ["xlsx"],
  },
  "application/vnd.ms-powerpoint": { mime: "application/vnd.ms-powerpoint", category: "document", extensions: ["ppt"] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    category: "document",
    extensions: ["pptx"],
  },
  "text/plain": { mime: "text/plain", category: "document", extensions: ["txt"] },
  "text/csv": { mime: "text/csv", category: "document", extensions: ["csv"] },

  // Videos: MP4, WEBM, MOV, MKV
  "video/mp4": { mime: "video/mp4", category: "video", extensions: ["mp4"] },
  "video/webm": { mime: "video/webm", category: "video", extensions: ["webm"] },
  "video/quicktime": { mime: "video/quicktime", category: "video", extensions: ["mov"] },
  "video/x-matroska": { mime: "video/x-matroska", category: "video", extensions: ["mkv"] },

  // Other: ZIP, RAR
  "application/zip": { mime: "application/zip", category: "archive", extensions: ["zip"] },
  "application/x-zip-compressed": { mime: "application/x-zip-compressed", category: "archive", extensions: ["zip"] },
  "application/vnd.rar": { mime: "application/vnd.rar", category: "archive", extensions: ["rar"] },
  "application/x-rar-compressed": { mime: "application/x-rar-compressed", category: "archive", extensions: ["rar"] },
};

/**
 * Storage Quotas and Limits (Requirement 7)
 */
export const STORAGE_LIMITS = {
  // Max individual file size: 100 MB standard
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,

  // Max video file size: 250 MB
  MAX_VIDEO_SIZE_BYTES: 250 * 1024 * 1024,

  // Max total folder storage: 500 MB (Guest) / 2 GB (Registered)
  MAX_FOLDER_STORAGE_GUEST_BYTES: 500 * 1024 * 1024,
  MAX_FOLDER_STORAGE_REGISTERED_BYTES: 2 * 1024 * 1024 * 1024,

  // Maximum files per folder
  MAX_FILES_PER_FOLDER: 100,

  // Maximum concurrent uploads allowed on client
  MAX_CONCURRENT_UPLOADS: 3,
};

/**
 * Sanitizes untrusted original file names (Requirement 9)
 * Removes path traversals, control characters, null bytes, trims, limits length.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return "file_" + Date.now();

  // Strip path traversals and directory separators
  let clean = filename.replace(/^.*[\\/]/, "");

  // Remove null bytes and control characters
  clean = clean.replace(/[\x00-\x1f\x80-\x9f]/g, "");

  // Replace potentially dangerous characters with underscore
  clean = clean.replace(/[<>:"/\\|?*#&%=+`!$';{}]/g, "_");

  // Collapse multiple underscores or spaces
  clean = clean.replace(/[\s_]+/g, "_").trim();

  // Truncate length while preserving extension
  if (clean.length > 120) {
    const lastDot = clean.lastIndexOf(".");
    if (lastDot > 0) {
      const ext = clean.slice(lastDot);
      const name = clean.slice(0, 120 - ext.length);
      clean = name + ext;
    } else {
      clean = clean.slice(0, 120);
    }
  }

  return clean || "unnamed_file";
}

/**
 * Extracts file extension in lowercase without leading dot
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length <= 1) return "";
  return parts.pop()?.toLowerCase().trim() || "";
}

/**
 * Validates a file against allowed MIME types and extensions (Requirement 7 & 8)
 */
export function validateFileAttributes(
  filename: string,
  mimeType: string,
  fileSize: number
): { isValid: boolean; error?: string; category?: AllowedTypeConfig["category"] } {
  const ext = getFileExtension(filename);
  if (!ext) {
    return { isValid: false, error: "Files without an extension are not supported." };
  }

  // Find match by MIME type or extension fallback
  let typeConfig = ALLOWED_FILE_TYPES[mimeType.toLowerCase()];
  if (!typeConfig) {
    // Check if extension matches any allowed type
    for (const conf of Object.values(ALLOWED_FILE_TYPES)) {
      if (conf.extensions.includes(ext)) {
        typeConfig = conf;
        break;
      }
    }
  }

  if (!typeConfig || !typeConfig.extensions.includes(ext)) {
    return {
      isValid: false,
      error: `File type .${ext} (${mimeType || "unknown"}) is not supported. Supported: Images, Documents, Videos, and ZIP/RAR.`,
    };
  }

  // Size limit validation
  const isVideo = typeConfig.category === "video";
  const maxAllowed = isVideo ? STORAGE_LIMITS.MAX_VIDEO_SIZE_BYTES : STORAGE_LIMITS.MAX_FILE_SIZE_BYTES;

  if (fileSize <= 0) {
    return { isValid: false, error: "File appears to be empty (0 bytes)." };
  }

  if (fileSize > maxAllowed) {
    const maxMb = Math.round(maxAllowed / (1024 * 1024));
    return {
      isValid: false,
      error: `File size exceeds the ${maxMb}MB maximum limit for ${isVideo ? "videos" : "files"}.`,
    };
  }

  return { isValid: true, category: typeConfig.category };
}

/**
 * Generates an unguessable, random storage key (Requirement 10)
 * Format: folders/<folderId>/<randomUuid>-<timestamp>.<ext>
 */
export function generateRandomStorageKey(folderId: string, extension: string): string {
  const randomHex = crypto.randomBytes(16).toString("hex");
  const ext = extension.replace(/^\./, "");
  return `folders/${folderId}/${randomHex}-${Date.now()}.${ext}`;
}

/**
 * Computes SHA-256 checksum (Requirement 18)
 */
export function computeSha256(buffer: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Storage keys of derived artifacts (thumbnails / previews) for an uploaded object.
 * Any generator of derived artifacts must use these keys so the cleanup job
 * can delete them alongside the original.
 */
export function getDerivedStorageKeys(storageKey: string): string[] {
  return [`thumbnails/${storageKey}`, `previews/${storageKey}`];
}
