import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { getFolderShareUrl } from "@/lib/folder";
import { computeExpirationStatus, getRetentionPolicy, getServerNow, serializeExpiration } from "@/lib/expiration";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId) {
      return NextResponse.json(
        { error: "Authentication required to access dashboard metrics", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const userId = session.userId;
    const [now, policy] = await Promise.all([getServerNow(prisma), getRetentionPolicy(prisma)]);

    // 1. Fetch user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    // 2. Fetch counts & storage aggregates from DB
    const [
      totalFolders,
      activeFolders,
      expiredFolders,
      totalFiles,
      storageAggregate,
      recentFoldersRaw,
      expiringSoonRaw,
    ] = await Promise.all([
      // Total non-deleted folders owned by user
      prisma.folder.count({
        where: { userId, deletedAt: null },
      }),

      // Active folders (non-deleted, expiresAt > now)
      prisma.folder.count({
        where: {
          userId,
          deletedAt: null,
          expiresAt: { gt: now },
        },
      }),

      // Expired folders (non-deleted, expiresAt <= now)
      prisma.folder.count({
        where: {
          userId,
          deletedAt: null,
          expiresAt: { lte: now },
        },
      }),

      // Total files across all non-deleted folders of this user
      prisma.file.count({
        where: {
          folder: { userId, deletedAt: null },
          deletedAt: null,
        },
      }),

      // Total storage used in bytes
      prisma.folder.aggregate({
        where: { userId, deletedAt: null },
        _sum: { totalSize: true },
      }),

      // Top 6 recently created folders
      prisma.folder.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          folderCode: true,
          folderName: true,
          description: true,
          visibility: true,
          allowDownload: true,
          createdAt: true,
          expiresAt: true,
          fileCount: true,
          totalSize: true,
          passwordHash: true,
        },
      }),

      // Folders expiring soonest (where expiresAt > now, ordered by expiresAt asc, limit 5)
      prisma.folder.findMany({
        where: {
          userId,
          deletedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: "asc" },
        take: 5,
        select: {
          id: true,
          folderCode: true,
          folderName: true,
          description: true,
          visibility: true,
          allowDownload: true,
          createdAt: true,
          expiresAt: true,
          fileCount: true,
          totalSize: true,
          passwordHash: true,
        },
      }),
    ]);

    const totalStorageBytes = storageAggregate._sum.totalSize ? storageAggregate._sum.totalSize.toString() : "0";
    // 25 GB default account quota
    const quotaBytes = (25 * 1024 * 1024 * 1024).toString();

    const formatFolder = (f: (typeof recentFoldersRaw)[number]) => ({
      id: f.id,
      folderCode: f.folderCode,
      folderName: f.folderName,
      description: f.description,
      visibility: f.visibility,
      allowDownload: f.allowDownload,
      hasPassword: Boolean(f.passwordHash),
      fileCount: f.fileCount,
      totalSizeBytes: f.totalSize.toString(),
      createdAt: f.createdAt.toISOString(),
      shareUrl: getFolderShareUrl(f.folderCode, req.nextUrl.origin),
      ...(() => {
        const exp = computeExpirationStatus(f.expiresAt, now, false, policy);
        return { ...serializeExpiration(f.expiresAt, now, exp), isExpired: exp.isExpired };
      })(),
    });

    return NextResponse.json({
      success: true,
      user,
      stats: {
        totalFolders,
        activeFolders,
        expiredFolders,
        totalFiles,
        totalStorageBytes,
        quotaBytes,
      },
      recentFolders: recentFoldersRaw.map(formatFolder),
      expiringSoon: expiringSoonRaw.map(formatFolder),
    });
  } catch (error) {
    console.error("[GET /api/dashboard/stats Error]:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard statistics" },
      { status: 500 }
    );
  }
}
