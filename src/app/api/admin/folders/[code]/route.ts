import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FolderStatus } from "@prisma/client";
import { getAdminSession } from "@/lib/auth";
import { getServerNow } from "@/lib/expiration";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { code: string };
}

/**
 * GET /api/admin/folders/[code]
 * Inspect folder metadata and contained files metadata.
 * Security:
 * - NEVER exposes passwordHash or ownershipTokenHash.
 * - Restrict file-content access: returns only file metadata (filename, size, mimeType, checksum, status),
 *   never raw storage keys or presigned download links.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const admin = await getAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const folderCode = params.code.trim().toUpperCase();
    const now = await getServerNow(prisma);

    const folder = await prisma.folder.findUnique({
      where: { folderCode },
      select: {
        id: true,
        folderCode: true,
        folderName: true,
        description: true,
        visibility: true,
        allowDownload: true,
        status: true,
        totalSize: true,
        fileCount: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        expiredAt: true,
        deletedAt: true,
        purgeAttempts: true,
        lastPurgeError: true,
        nextPurgeAttemptAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        files: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            originalFileName: true,
            mimeType: true,
            fileSize: true,
            uploadStatus: true,
            checksum: true,
            createdAt: true,
            updatedAt: true,
            purgeAttempts: true,
            lastPurgeError: true,
            // SECURITY: Do NOT select storageKey to prevent exposing private storage paths/keys
          },
        },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const isExpired = folder.status === FolderStatus.EXPIRED || folder.expiresAt.getTime() <= now.getTime();
    const isDeleted = folder.status === FolderStatus.DELETED || folder.deletedAt !== null;
    let effectiveStatus = "ACTIVE";
    if (isDeleted) effectiveStatus = "DELETED";
    else if (isExpired) effectiveStatus = "EXPIRED";

    return NextResponse.json({
      success: true,
      folder: {
        id: folder.id,
        folderCode: folder.folderCode,
        folderName: folder.folderName,
        description: folder.description,
        visibility: folder.visibility,
        allowDownload: folder.allowDownload,
        status: effectiveStatus,
        rawStatus: folder.status,
        totalSize: folder.totalSize.toString(),
        fileCount: folder.fileCount,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
        expiresAt: folder.expiresAt.toISOString(),
        expiredAt: folder.expiredAt?.toISOString() || null,
        deletedAt: folder.deletedAt?.toISOString() || null,
        owner: folder.user
          ? { id: folder.user.id, email: folder.user.email, name: folder.user.name, isGuest: false }
          : { isGuest: true, label: "Guest (Ephemeral)" },
        purgeAttempts: folder.purgeAttempts,
        lastPurgeError: folder.lastPurgeError,
        files: folder.files.map((file) => ({
          id: file.id,
          originalFileName: file.originalFileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize.toString(),
          uploadStatus: file.uploadStatus,
          checksum: file.checksum,
          createdAt: file.createdAt.toISOString(),
          updatedAt: file.updatedAt.toISOString(),
          purgeAttempts: file.purgeAttempts,
          lastPurgeError: file.lastPurgeError,
        })),
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/folders/[code] Error]:", error);
    return NextResponse.json({ error: "Failed to load folder details" }, { status: 500 });
  }
}
