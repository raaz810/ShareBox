import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { checkFolderOwnership } from "@/lib/folder";
import { checkFolderAccess } from "@/lib/expiration";
import { storageService } from "@/lib/storage";
import {
  sanitizeFilename,
  getFileExtension,
  validateFileAttributes,
  generateRandomStorageKey,
  STORAGE_LIMITS,
} from "@/lib/storage-config";
import { PermissionType } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    code: string;
  };
}

/**
 * Checks if the caller has permission to upload to this folder (Requirement 14)
 */
async function canUploadToFolder(
  folder: { id: string; userId: string | null; ownershipTokenHash: string },
  sessionUserId: string | null,
  rawGuestToken: string | null
): Promise<boolean> {
  // 1. Owner can always upload
  if (checkFolderOwnership(folder, sessionUserId, rawGuestToken)) {
    return true;
  }

  // 2. If registered user, check FolderPermission table
  if (sessionUserId) {
    const permission = await prisma.folderPermission.findUnique({
      where: {
        folderId_userId: {
          folderId: folder.id,
          userId: sessionUserId,
        },
      },
    });

    if (
      permission &&
      (permission.permission === PermissionType.UPLOAD || permission.permission === PermissionType.MANAGE)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * POST /api/folders/[code]/upload
 * Upload one or more files to a folder with validation, random keys, and quota tracking
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const code = params.code?.toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "Folder code is required" }, { status: 400 });
    }

    // 1. Fetch folder
    const folder = await prisma.folder.findUnique({
      where: { folderCode: code },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const access = await checkFolderAccess(folder);
    if (!access.ok) {
      return NextResponse.json({ error: access.error, code: access.code }, { status: access.status });
    }

    // 2. Verify Upload Authorization
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const rawGuestToken =
      req.headers.get("x-ownership-token") ||
      req.cookies.get(`sharebox_owner_${code}`)?.value ||
      null;

    const isAuthorized = await canUploadToFolder(folder, session?.userId || null, rawGuestToken);
    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: "Unauthorized: Only the folder creator or authorized contributors can upload files to this folder.",
          code: "FORBIDDEN_UPLOAD",
        },
        { status: 403 }
      );
    }

    // 3. Parse Multipart Form Data
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Invalid form data. File payload expected." }, { status: 400 });
    }

    const files = formData.getAll("file") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided for upload." }, { status: 400 });
    }

    // Quota limits check
    const isRegisteredFolder = Boolean(folder.userId);
    const maxStorageAllowed = isRegisteredFolder
      ? STORAGE_LIMITS.MAX_FOLDER_STORAGE_REGISTERED_BYTES
      : STORAGE_LIMITS.MAX_FOLDER_STORAGE_GUEST_BYTES;

    if (folder.fileCount + files.length > STORAGE_LIMITS.MAX_FILES_PER_FOLDER) {
      return NextResponse.json(
        {
          error: `Folder limit of ${STORAGE_LIMITS.MAX_FILES_PER_FOLDER} files reached. Cannot upload ${files.length} more.`,
        },
        { status: 400 }
      );
    }

    const uploadedRecords = [];
    let addedBytes = BigInt(0);

    for (const file of files) {
      // 4. File name sanitization & extension check (Requirement 9 & 10)
      const rawName = file.name || "unnamed";
      const sanitizedName = sanitizeFilename(rawName);
      const ext = getFileExtension(sanitizedName);

      // 5. Validation: MIME type, extension, size (Requirement 7 & 8)
      const validation = validateFileAttributes(sanitizedName, file.type, file.size);
      if (!validation.isValid) {
        return NextResponse.json({ error: `${rawName}: ${validation.error}` }, { status: 400 });
      }

      // 6. Check total folder storage quota
      const newTotal = folder.totalSize + addedBytes + BigInt(file.size);
      if (newTotal > BigInt(maxStorageAllowed)) {
        const quotaMb = Math.round(maxStorageAllowed / (1024 * 1024));
        return NextResponse.json(
          { error: `Uploading ${rawName} would exceed the folder storage quota of ${quotaMb} MB.` },
          { status: 400 }
        );
      }

      // 7. Read file binary buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 8. Generate completely random storage key (Requirement 10)
      const storageKey = generateRandomStorageKey(folder.id, ext);

      // 9. Upload to Object Storage (R2 / S3 / LocalDisk) (Requirement 1, 11, 12)
      const uploadResult = await storageService.upload({
        key: storageKey,
        body: buffer,
        contentType: file.type || "application/octet-stream",
        contentLength: buffer.length,
      });

      // 10. Store metadata in PostgreSQL (NEVER file binary data) (Requirement 11, 18)
      // If the row can't be written (e.g. the folder expired and was purged mid-upload), remove
      // the object: without a File row the cleanup job has no pointer to it and it would leak.
      const fileRecord = await prisma.file
        .create({
          data: {
            folderId: folder.id,
            originalFileName: sanitizedName,
            storageKey,
            mimeType: file.type || "application/octet-stream",
            fileSize: BigInt(file.size),
            checksum: uploadResult.checksum || null,
            uploadStatus: "COMPLETED",
          },
        })
        .catch(async (err) => {
          await storageService.delete(storageKey).catch((delErr) => {
            console.error(`[upload] orphaned storage object ${storageKey}:`, delErr);
          });
          throw err;
        });

      addedBytes += BigInt(file.size);
      uploadedRecords.push({
        id: fileRecord.id,
        fileName: fileRecord.originalFileName,
        mimeType: fileRecord.mimeType,
        fileSize: fileRecord.fileSize.toString(),
        checksum: fileRecord.checksum,
        createdAt: fileRecord.createdAt.toISOString(),
      });
    }

    // 11. Atomically update Folder totals (Requirement 15)
    const updatedFolder = await prisma.folder.update({
      where: { id: folder.id },
      data: {
        totalSize: { increment: addedBytes },
        fileCount: { increment: uploadedRecords.length },
      },
    });

    // 12. Audit log
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    prisma.auditLog
      .create({
        data: {
          userId: session?.userId || null,
          folderId: folder.id,
          action: "FILE_UPLOAD",
          ipAddress: clientIp,
          userAgent: req.headers.get("user-agent") || null,
          metadata: JSON.stringify({
            count: uploadedRecords.length,
            bytes: addedBytes.toString(),
          }),
        },
      })
      .catch(() => null);

    return NextResponse.json(
      {
        success: true,
        message: `${uploadedRecords.length} file(s) uploaded successfully`,
        files: uploadedRecords,
        folderStats: {
          fileCount: updatedFolder.fileCount,
          totalSizeBytes: updatedFolder.totalSize.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/folders/[code]/upload Error]:", error);
    return NextResponse.json(
      { error: "Failed to upload file(s) to storage" },
      { status: 500 }
    );
  }
}
