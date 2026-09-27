import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  AUTH_COOKIE_NAME,
  verifySessionToken,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { getFolderShareUrl, checkFolderOwnership } from "@/lib/folder";
import {
  checkFolderAccess,
  getServerNow,
  serializeExpiration,
  FolderStatus,
} from "@/lib/expiration";
import { FolderVisibility } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: {
    code: string;
  };
}

/**
 * Helper to extract ownership token from headers, cookies, or query parameters
 */
function extractGuestOwnershipToken(req: NextRequest, folderCode: string): string | null {
  const headerToken = req.headers.get("x-ownership-token");
  if (headerToken) return headerToken.trim();

  const cookieToken = req.cookies.get(`sharebox_owner_${folderCode}`)?.value;
  if (cookieToken) return cookieToken.trim();

  const queryToken = req.nextUrl.searchParams.get("ownershipToken");
  if (queryToken) return queryToken.trim();

  return null;
}

/**
 * GET /api/folders/[code]
 * Retrieve folder metadata, status, remaining time, and public attributes
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const code = params.code?.toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "Folder code is required", code: "INVALID_CODE" }, { status: 400 });
    }

    // 1. Fetch folder from DB
    const folder = await prisma.folder.findUnique({
      where: { folderCode: code },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Folder not found. Please verify the 8-character code.", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // 2. Identify caller authorization
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const guestToken = extractGuestOwnershipToken(req, code);
    const isOwner = checkFolderOwnership(folder, session?.userId, guestToken);

    // 3 & 4. Server-side lifecycle gate: deleted, marked expired, or expiresAt <= server now
    const access = await checkFolderAccess(folder);
    if (!access.ok) {
      return NextResponse.json(
        {
          error: access.error,
          code: access.code,
          folderCode: folder.folderCode,
          ...(access.code === "EXPIRED"
            ? { folderName: folder.folderName, expiresAt: folder.expiresAt.toISOString() }
            : { deletedAt: (folder.deletedAt ?? access.now).toISOString() }),
          serverTime: access.now.toISOString(),
          isOwner,
        },
        { status: access.status }
      );
    }
    const expirationFields = serializeExpiration(folder.expiresAt, access.now, access.expiration);

    // 5. Handle Private Folders
    if (folder.visibility === FolderVisibility.PRIVATE && !isOwner) {
      return NextResponse.json(
        {
          error: "This folder is marked as private. Only the creator has access.",
          code: "PRIVATE_FOLDER",
          folderCode: folder.folderCode,
        },
        { status: 403 }
      );
    }

    // 6. Handle Password-Protected Folders
    const hasPassword = Boolean(folder.passwordHash);
    let isUnlocked = true;

    if (hasPassword && !isOwner) {
      // Non-owners must supply correct password
      const providedPassword =
        req.headers.get("x-folder-password") ||
        req.nextUrl.searchParams.get("password");

      if (!providedPassword) {
        isUnlocked = false;
      } else {
        const matches = await verifyPassword(providedPassword, folder.passwordHash!);
        if (!matches) {
          return NextResponse.json(
            {
              error: "Invalid folder password. Please try again.",
              code: "INVALID_PASSWORD",
              requiresPassword: true,
              folderCode: folder.folderCode,
              folderName: folder.folderName,
            },
            { status: 401 }
          );
        }
      }
    }

    const shareUrl = getFolderShareUrl(folder.folderCode, req.nextUrl.origin);

    // If locked by password, return partial safe metadata
    if (!isUnlocked) {
      return NextResponse.json({
        success: true,
        requiresPassword: true,
        isUnlocked: false,
        isOwner: false,
        folder: {
          folderCode: folder.folderCode,
          folderName: folder.folderName,
          visibility: folder.visibility,
          ...expirationFields,
          shareUrl,
          hasPassword: true,
          isGuest: !folder.userId,
        },
      });
    }

    // 7. Full folder response
    return NextResponse.json({
      success: true,
      requiresPassword: false,
      isUnlocked: true,
      isOwner,
      folder: {
        id: folder.id,
        folderCode: folder.folderCode,
        folderName: folder.folderName,
        description: folder.description,
        visibility: folder.visibility,
        allowDownload: folder.allowDownload,
        hasPassword,
        fileCount: folder.fileCount,
        totalSizeBytes: folder.totalSize.toString(),
        createdAt: folder.createdAt.toISOString(),
        ...expirationFields,
        shareUrl,
        isGuest: !folder.userId,
        isRegistered: Boolean(folder.userId),
        creatorName: folder.user?.name || (folder.userId ? "Registered User" : "Guest"),
      },
    });
  } catch (error) {
    console.error("[GET /api/folders/[code] Error]:", error);
    return NextResponse.json({ error: "Failed to retrieve folder details" }, { status: 500 });
  }
}

/**
 * PATCH /api/folders/[code]
 * Update folder settings (Requires Owner Authorization)
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const code = params.code?.toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "Folder code is required" }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({
      where: { folderCode: code },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const access = await checkFolderAccess(folder);
    if (!access.ok) {
      const error = access.code === "EXPIRED" ? "Cannot modify an expired folder" : "Cannot modify a deleted folder";
      return NextResponse.json({ error, code: access.code }, { status: access.status });
    }

    // Authorization verification
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const guestToken = extractGuestOwnershipToken(req, code);
    const isOwner = checkFolderOwnership(folder, session?.userId, guestToken);

    if (!isOwner) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to modify this folder", code: "UNAUTHORIZED" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { folderName, description, allowDownload, visibility, password, removePassword } = body;

    const updateData: {
      folderName?: string;
      description?: string | null;
      allowDownload?: boolean;
      visibility?: FolderVisibility;
      passwordHash?: string | null;
    } = {};

    if (folderName !== undefined) {
      if (typeof folderName !== "string" || folderName.trim().length === 0) {
        return NextResponse.json({ error: "Folder name cannot be empty" }, { status: 400 });
      }
      if (folderName.trim().length > 100) {
        return NextResponse.json({ error: "Folder name cannot exceed 100 characters" }, { status: 400 });
      }
      updateData.folderName = folderName.trim();
    }

    if (description !== undefined) {
      updateData.description =
        typeof description === "string" && description.trim().length > 0
          ? description.trim().slice(0, 1000)
          : null;
    }

    if (allowDownload !== undefined) {
      updateData.allowDownload = Boolean(allowDownload);
    }

    if (removePassword === true) {
      updateData.passwordHash = null;
      if (folder.visibility === FolderVisibility.PASSWORD_PROTECTED) {
        updateData.visibility = FolderVisibility.PUBLIC;
      }
    } else if (password && typeof password === "string" && password.trim().length > 0) {
      if (password.length < 4) {
        return NextResponse.json({ error: "Password must be at least 4 characters long" }, { status: 400 });
      }
      updateData.passwordHash = await hashPassword(password);
      updateData.visibility = FolderVisibility.PASSWORD_PROTECTED;
    }

    if (visibility && (visibility === "PUBLIC" || visibility === "PRIVATE" || visibility === "PASSWORD_PROTECTED")) {
      updateData.visibility = visibility as FolderVisibility;
    }

    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      folder: {
        id: updated.id,
        folderCode: updated.folderCode,
        folderName: updated.folderName,
        description: updated.description,
        visibility: updated.visibility,
        allowDownload: updated.allowDownload,
        hasPassword: Boolean(updated.passwordHash),
        expiresAt: updated.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[PATCH /api/folders/[code] Error]:", error);
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

/**
 * DELETE /api/folders/[code]
 * Soft-delete a folder (Requires Owner Authorization)
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const code = params.code?.toUpperCase().trim();
    if (!code) {
      return NextResponse.json({ error: "Folder code is required" }, { status: 400 });
    }

    const folder = await prisma.folder.findUnique({
      where: { folderCode: code },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    // Authorization verification
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const guestToken = extractGuestOwnershipToken(req, code);
    const isOwner = checkFolderOwnership(folder, session?.userId, guestToken);

    if (!isOwner) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to delete this folder", code: "UNAUTHORIZED" },
        { status: 403 }
      );
    }

    // Soft delete: access is blocked immediately; cleanup purges storage and the row later
    const deletedAt = await getServerNow(prisma);
    await prisma.folder.update({
      where: { id: folder.id },
      data: { deletedAt, status: FolderStatus.DELETED } as any,
    });

    // Audit log
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    prisma.auditLog
      .create({
        data: {
          userId: folder.userId || session?.userId || null,
          folderId: folder.id,
          action: "FOLDER_DELETE",
          ipAddress: clientIp,
          userAgent: req.headers.get("user-agent") || null,
          metadata: JSON.stringify({
            folderCode: folder.folderCode,
            deletedAt: deletedAt.toISOString(),
          }),
        },
      })
      .catch(() => null);

    return NextResponse.json({
      success: true,
      message: "Folder has been successfully deleted",
    });
  } catch (error) {
    console.error("[DELETE /api/folders/[code] Error]:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
