import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { FolderStatus, Prisma } from "@prisma/client";
import { getAdminSession } from "@/lib/auth";
import { getServerNow } from "@/lib/expiration";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/folders
 * List folders with search by folderCode/name, status filtering, and owner metadata.
 * Security: NEVER returns passwordHash or ownershipTokenHash.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const search = searchParams.get("search")?.trim() || "";
    const statusParam = searchParams.get("status")?.trim().toUpperCase() || "ALL";
    const ownerType = searchParams.get("ownerType")?.trim().toLowerCase() || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "15", 10)));
    const skip = (page - 1) * limit;

    const now = await getServerNow(prisma);
    const where: Prisma.FolderWhereInput = {};

    if (search) {
      where.OR = [
        { folderCode: { contains: search.toUpperCase() } },
        { folderName: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (statusParam === "ACTIVE") {
      where.status = FolderStatus.ACTIVE;
      where.deletedAt = null;
      where.expiresAt = { gt: now };
    } else if (statusParam === "EXPIRED") {
      where.OR = [
        { status: FolderStatus.EXPIRED },
        { expiresAt: { lte: now } },
      ];
    } else if (statusParam === "DELETED") {
      where.OR = [
        { status: FolderStatus.DELETED },
        { deletedAt: { not: null } },
      ];
    }

    if (ownerType === "guest") {
      where.userId = null;
    } else if (ownerType === "registered") {
      where.userId = { not: null };
    }

    const [total, folders] = await Promise.all([
      prisma.folder.count({ where }),
      prisma.folder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          folderCode: true,
          folderName: true,
          description: true,
          visibility: true,
          status: true,
          createdAt: true,
          expiresAt: true,
          expiredAt: true,
          deletedAt: true,
          totalSize: true,
          fileCount: true,
          purgeAttempts: true,
          lastPurgeError: true,
          nextPurgeAttemptAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const formatted = folders.map((f) => {
      const isExpired = f.status === FolderStatus.EXPIRED || f.expiresAt.getTime() <= now.getTime();
      const isDeleted = f.status === FolderStatus.DELETED || f.deletedAt !== null;
      let effectiveStatus = "ACTIVE";
      if (isDeleted) effectiveStatus = "DELETED";
      else if (isExpired) effectiveStatus = "EXPIRED";

      return {
        id: f.id,
        folderCode: f.folderCode,
        folderName: f.folderName,
        description: f.description,
        visibility: f.visibility,
        status: effectiveStatus,
        rawStatus: f.status,
        owner: f.user
          ? { id: f.user.id, email: f.user.email, name: f.user.name, isGuest: false }
          : { isGuest: true, label: "Guest (Ephemeral)" },
        totalSize: f.totalSize.toString(),
        fileCount: f.fileCount,
        expiresAt: f.expiresAt.toISOString(),
        expiredAt: f.expiredAt?.toISOString() || null,
        deletedAt: f.deletedAt?.toISOString() || null,
        createdAt: f.createdAt.toISOString(),
        purgeAttempts: f.purgeAttempts,
        lastPurgeError: f.lastPurgeError,
      };
    });

    return NextResponse.json({
      success: true,
      folders: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error("[GET /api/admin/folders Error]:", error);
    return NextResponse.json({ error: "Failed to load folders" }, { status: 500 });
  }
}
