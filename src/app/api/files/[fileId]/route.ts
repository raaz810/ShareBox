import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken, verifyPassword } from "@/lib/auth";
import { checkFolderOwnership } from "@/lib/folder";
import { capSignedUrlTtl, checkFolderAccess } from "@/lib/expiration";
import { storageService } from "@/lib/storage";
import { sanitizeFilename, getFileExtension } from "@/lib/storage-config";
import { FolderVisibility } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    fileId: string;
  };
}

/**
 * GET /api/files/[fileId]
 * Generates a temporary signed download URL for a file (Requirement 4, 12, 13)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const fileId = params.fileId;
    if (!fileId) {
      return NextResponse.json({ error: "File ID is required" }, { status: 400 });
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { folder: true },
    });

    if (!file || file.deletedAt) {
      return NextResponse.json({ error: "File not found or has been deleted" }, { status: 404 });
    }

    const folder = file.folder;
    const access = await checkFolderAccess(folder);
    if (!access.ok) {
      const error =
        access.code === "EXPIRED"
          ? "Folder has expired. Files are no longer accessible."
          : "Parent folder has been deleted";
      return NextResponse.json({ error, code: access.code }, { status: access.status });
    }

    // Authorization checks
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const rawGuestToken =
      req.headers.get("x-ownership-token") ||
      req.cookies.get(`sharebox_owner_${folder.folderCode}`)?.value ||
      null;

    const isOwner = checkFolderOwnership(folder, session?.userId || null, rawGuestToken);

    // Download privilege check (Requirement 4 & 14)
    if (!folder.allowDownload && !isOwner) {
      return NextResponse.json(
        { error: "Downloads have been disabled by the folder owner for this repository." },
        { status: 403 }
      );
    }

    // Private folder check
    if (folder.visibility === FolderVisibility.PRIVATE && !isOwner) {
      return NextResponse.json({ error: "Private folder access denied" }, { status: 403 });
    }

    // Password protected check
    if (folder.visibility === FolderVisibility.PASSWORD_PROTECTED && folder.passwordHash && !isOwner) {
      const providedPassword =
        req.headers.get("x-folder-password") ||
        req.nextUrl.searchParams.get("password");

      if (!providedPassword || !(await verifyPassword(providedPassword, folder.passwordHash))) {
        return NextResponse.json(
          { error: "Password verification required before downloading this file" },
          { status: 401 }
        );
      }
    }

    // Temporary signed download URL: 15 minutes, but never beyond the folder's expiry,
    // so a link issued just before expiry cannot be used after it (Part 7)
    const ttlSeconds = capSignedUrlTtl(900, access.expiration.remainingMs);
    const downloadUrl = await storageService.getSignedDownloadUrl({
      key: file.storageKey,
      filename: file.originalFileName,
      contentType: file.mimeType,
      expiresInSeconds: ttlSeconds,
    });

    // Optional download redirect if requested via ?download=1
    const shouldRedirect = req.nextUrl.searchParams.get("download") === "1";

    // Audit log
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    prisma.auditLog
      .create({
        data: {
          userId: session?.userId || null,
          folderId: folder.id,
          action: "FILE_DOWNLOAD",
          ipAddress: clientIp,
          userAgent: req.headers.get("user-agent") || null,
          metadata: JSON.stringify({
            fileId: file.id,
            fileName: file.originalFileName,
            sizeBytes: file.fileSize.toString(),
          }),
        },
      })
      .catch(() => null);

    if (shouldRedirect) {
      return NextResponse.redirect(downloadUrl);
    }

    return NextResponse.json({
      success: true,
      downloadUrl,
      fileName: file.originalFileName,
      fileSize: file.fileSize.toString(),
      mimeType: file.mimeType,
      expiresInSeconds: ttlSeconds,
    });
  } catch (error) {
    console.error("[GET /api/files/[fileId] Error]:", error);
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }
}

/**
 * DELETE /api/files/[fileId]
 * Deletes a file from storage and database (Requires Owner Authorization) (Requirement 17)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const fileId = params.fileId;
    if (!fileId) {
      return NextResponse.json({ error: "File ID is required" }, { status: 400 });
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { folder: true },
    });

    if (!file || file.deletedAt) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const folder = file.folder;

    // Check ownership authorization
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const rawGuestToken =
      req.headers.get("x-ownership-token") ||
      req.cookies.get(`sharebox_owner_${folder.folderCode}`)?.value ||
      null;

    const isOwner = checkFolderOwnership(folder, session?.userId || null, rawGuestToken);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to delete this file" },
        { status: 403 }
      );
    }

    // 1. Delete object from storage provider
    await storageService.delete(file.storageKey).catch((err) => {
      console.warn("Storage deletion warning:", err);
    });

    // 2. Mark file as deleted
    await prisma.file.update({
      where: { id: file.id },
      data: { deletedAt: new Date() },
    });

    // 3. Atomically decrement folder totals
    const newTotalSize = folder.totalSize >= file.fileSize ? folder.totalSize - file.fileSize : BigInt(0);
    const newFileCount = folder.fileCount > 0 ? folder.fileCount - 1 : 0;

    await prisma.folder.update({
      where: { id: folder.id },
      data: {
        totalSize: newTotalSize,
        fileCount: newFileCount,
      },
    });

    // Audit log
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    prisma.auditLog
      .create({
        data: {
          userId: session?.userId || null,
          folderId: folder.id,
          action: "FILE_DELETE",
          ipAddress: clientIp,
          userAgent: req.headers.get("user-agent") || null,
          metadata: JSON.stringify({
            fileId: file.id,
            fileName: file.originalFileName,
          }),
        },
      })
      .catch(() => null);

    return NextResponse.json({
      success: true,
      message: "File successfully deleted",
    });
  } catch (error) {
    console.error("[DELETE /api/files/[fileId] Error]:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}

/**
 * PATCH /api/files/[fileId]
 * Update file metadata (e.g. rename file display name) (Requires Owner Authorization)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const fileId = params.fileId;
    if (!fileId) {
      return NextResponse.json({ error: "File ID is required" }, { status: 400 });
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { folder: true },
    });

    if (!file || file.deletedAt) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const folder = file.folder;

    // Check ownership authorization
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const rawGuestToken =
      req.headers.get("x-ownership-token") ||
      req.cookies.get(`sharebox_owner_${folder.folderCode}`)?.value ||
      null;

    const isOwner = checkFolderOwnership(folder, session?.userId || null, rawGuestToken);
    if (!isOwner) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to modify this file" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { fileName } = body;

    if (!fileName || typeof fileName !== "string" || fileName.trim().length === 0) {
      return NextResponse.json({ error: "A valid file name is required" }, { status: 400 });
    }

    // Preserve original extension
    const currentExt = getFileExtension(file.originalFileName);
    let sanitized = sanitizeFilename(fileName.trim());
    if (currentExt && !sanitized.endsWith(`.${currentExt}`)) {
      sanitized = `${sanitized}.${currentExt}`;
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: { originalFileName: sanitized },
    });

    return NextResponse.json({
      success: true,
      file: {
        id: updated.id,
        fileName: updated.originalFileName,
        mimeType: updated.mimeType,
        fileSize: updated.fileSize.toString(),
      },
    });
  } catch (error) {
    console.error("[PATCH /api/files/[fileId] Error]:", error);
    return NextResponse.json({ error: "Failed to update file" }, { status: 500 });
  }
}
