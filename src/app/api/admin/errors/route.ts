import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/errors
 * List real database records for upload errors and operational errors.
 * Security: NEVER exposes private storage credentials or authentication secrets.
 */
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminSession(req);
    if (!admin) {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const [
      failedFiles,
      abortedSessions,
      failedCleanupJobs,
      failedPurgeFolders,
      failedPurgeFiles,
      errorAuditLogs,
    ] = await Promise.all([
      // 1. Files with upload failure status
      prisma.file.findMany({
        where: { uploadStatus: "FAILED" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          originalFileName: true,
          mimeType: true,
          fileSize: true,
          uploadStatus: true,
          createdAt: true,
          folder: {
            select: {
              folderCode: true,
              folderName: true,
            },
          },
        },
      }),

      // 2. Aborted / Expired upload sessions
      prisma.uploadSession.findMany({
        where: { status: { in: ["ABORTED", "EXPIRED"] } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          sessionToken: true,
          totalFilesExpected: true,
          totalBytesExpected: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          folder: {
            select: {
              folderCode: true,
              folderName: true,
            },
          },
        },
      }),

      // 3. Failed or Partial cleanup jobs
      prisma.cleanupJob.findMany({
        where: {
          OR: [{ status: "FAILED" }, { status: "PARTIAL" }, { errorMessage: { not: null } }],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          jobType: true,
          status: true,
          attempts: true,
          itemsProcessed: true,
          failedDeletions: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
        },
      }),

      // 4. Folders with storage purge errors
      prisma.folder.findMany({
        where: {
          OR: [{ lastPurgeError: { not: null } }, { purgeAttempts: { gt: 0 } }],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          folderCode: true,
          folderName: true,
          status: true,
          purgeAttempts: true,
          lastPurgeError: true,
          nextPurgeAttemptAt: true,
          updatedAt: true,
        },
      }),

      // 5. Files with storage purge errors
      prisma.file.findMany({
        where: {
          OR: [{ lastPurgeError: { not: null } }, { purgeAttempts: { gt: 0 } }],
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          originalFileName: true,
          fileSize: true,
          purgeAttempts: true,
          lastPurgeError: true,
          nextPurgeAttemptAt: true,
          updatedAt: true,
          folder: {
            select: {
              folderCode: true,
              folderName: true,
            },
          },
        },
      }),

      // 6. Audit logs noting system errors or failures
      prisma.auditLog.findMany({
        where: {
          OR: [
            { action: { contains: "FAIL", mode: "insensitive" } },
            { action: { contains: "ERROR", mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          action: true,
          ipAddress: true,
          metadata: true,
          createdAt: true,
          user: { select: { email: true } },
          folder: { select: { folderCode: true } },
        },
      }),
    ]);

    // Format upload errors
    const uploadErrors = [
      ...failedFiles.map((f) => ({
        id: f.id,
        type: "FILE_UPLOAD_FAILED" as const,
        title: f.originalFileName,
        mimeType: f.mimeType,
        sizeBytes: f.fileSize.toString(),
        folderCode: f.folder?.folderCode || null,
        folderName: f.folder?.folderName || null,
        status: f.uploadStatus,
        details: "File upload marked as FAILED in database",
        timestamp: f.createdAt.toISOString(),
      })),
      ...abortedSessions.map((s) => ({
        id: s.id,
        type: "SESSION_ABORTED" as const,
        title: `Upload Session (${s.status})`,
        mimeType: null,
        sizeBytes: s.totalBytesExpected.toString(),
        folderCode: s.folder?.folderCode || null,
        folderName: s.folder?.folderName || null,
        status: s.status,
        details: `Expected ${s.totalFilesExpected} files. Session expired or aborted before completion.`,
        timestamp: s.updatedAt.toISOString(),
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Format operational errors
    const operationalErrors = [
      ...failedCleanupJobs.map((j) => ({
        id: j.id,
        category: "CLEANUP_JOB" as const,
        title: `Cleanup Job ${j.jobType} (${j.status})`,
        status: j.status,
        attempts: j.attempts,
        error: j.errorMessage || `${j.failedDeletions} deletion(s) failed`,
        timestamp: j.createdAt.toISOString(),
        details: `Failed deletions: ${j.failedDeletions}, Processed: ${j.itemsProcessed}`,
      })),
      ...failedPurgeFolders.map((f) => ({
        id: f.id,
        category: "FOLDER_PURGE" as const,
        title: `Folder Purge: ${f.folderCode} (${f.folderName})`,
        status: f.status,
        attempts: f.purgeAttempts,
        error: f.lastPurgeError || "Purge failed",
        timestamp: f.updatedAt.toISOString(),
        details: f.nextPurgeAttemptAt
          ? `Next retry scheduled at: ${f.nextPurgeAttemptAt.toISOString()}`
          : "Retry pending",
      })),
      ...failedPurgeFiles.map((f) => ({
        id: f.id,
        category: "FILE_PURGE" as const,
        title: `File Storage Purge: ${f.originalFileName}`,
        status: "PURGE_ERROR",
        attempts: f.purgeAttempts,
        error: f.lastPurgeError || "Storage purge failed",
        timestamp: f.updatedAt.toISOString(),
        details: f.folder?.folderCode ? `Folder: ${f.folder.folderCode}` : undefined,
      })),
      ...errorAuditLogs.map((l) => ({
        id: l.id,
        category: "AUDIT_FAILURE" as const,
        title: `System Alert: ${l.action}`,
        status: "ALERT",
        attempts: 1,
        error: l.metadata ? (typeof l.metadata === "string" ? l.metadata : JSON.stringify(l.metadata)) : l.action,
        timestamp: l.createdAt.toISOString(),
        details: l.user?.email ? `User: ${l.user.email}` : undefined,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      success: true,
      summary: {
        totalUploadErrors: uploadErrors.length,
        totalOperationalErrors: operationalErrors.length,
      },
      uploadErrors,
      operationalErrors,
    });
  } catch (error) {
    console.error("[GET /api/admin/errors Error]:", error);
    return NextResponse.json({ error: "Failed to load system errors" }, { status: 500 });
  }
}
