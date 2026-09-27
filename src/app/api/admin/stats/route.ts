import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerNow } from "@/lib/expiration";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const now = await getServerNow(prisma);

    const [
      totalUsers,
      totalFolders,
      activeFolders,
      expiredFolders,
      expiredFoldersAwaitingCleanup,
      failedCleanupJobs,
      uploadFailures,
      guestFolders,
      registeredFolders,
      totalFiles,
      storageAggregate,
      lastCleanup,
      recentAuditLogs,
    ] = await Promise.all([
      // 1. Total registered users
      prisma.user.count(),

      // Total folders
      prisma.folder.count({ where: { deletedAt: null } }),

      // 2. Active folders
      prisma.folder.count({ where: { status: "ACTIVE", deletedAt: null, expiresAt: { gt: now } } }),

      // Expired folders
      prisma.folder.count({ where: { deletedAt: null, expiresAt: { lte: now } } }),

      // 5. Expired folders awaiting cleanup (soft-deleted or expired by time/status, not yet purged)
      prisma.folder.count({
        where: {
          OR: [
            { status: "EXPIRED" },
            { status: "DELETED" },
            { deletedAt: { not: null } },
            { expiresAt: { lte: now } },
          ],
        },
      }),

      // 6. Failed cleanup jobs
      prisma.cleanupJob.count({ where: { status: "FAILED" } }),

      // 7. Upload failures
      prisma.file.count({ where: { uploadStatus: "FAILED" } }),

      // Guest folders
      prisma.folder.count({ where: { deletedAt: null, userId: null } }),

      // Registered folders
      prisma.folder.count({ where: { deletedAt: null, userId: { not: null } } }),

      // 3. Total files
      prisma.file.count({ where: { deletedAt: null } }),

      // 4. Total storage aggregate
      prisma.folder.aggregate({
        where: { deletedAt: null },
        _sum: { totalSize: true },
      }),

      // Last cleanup job
      prisma.cleanupJob.findFirst({
        orderBy: { createdAt: "desc" },
      }),

      // Recent 5 audit logs
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          user: { select: { email: true, name: true } },
          folder: { select: { folderCode: true, folderName: true } },
        },
      }),
    ]);

    const totalStorageBytes = storageAggregate._sum.totalSize ? storageAggregate._sum.totalSize.toString() : "0";

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers,
        totalFolders,
        activeFolders,
        expiredFolders,
        expiredFoldersAwaitingCleanup,
        failedCleanupJobs,
        uploadFailures,
        guestFolders,
        registeredFolders,
        totalFiles,
        totalStorageBytes,
        lastCleanup: lastCleanup
          ? {
              id: lastCleanup.id,
              status: lastCleanup.status,
              itemsProcessed: lastCleanup.itemsProcessed,
              bytesReclaimed: lastCleanup.bytesReclaimed.toString(),
              completedAt: lastCleanup.completedAt?.toISOString() || null,
            }
          : null,
      },
      recentAuditLogs: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        userEmail: log.user?.email || "Guest / System",
        folderCode: log.folder?.folderCode || null,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[GET /api/admin/stats Error]:", error);
    return NextResponse.json({ error: "Failed to load admin stats" }, { status: 500 });
  }
}
