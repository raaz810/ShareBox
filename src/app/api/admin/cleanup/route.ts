import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { runCleanupJob, serializeCleanupResult } from "@/lib/cleanup";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cleanup
 * List recent cleanup jobs history
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const jobs = await prisma.cleanupJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const formatted = jobs.map((j) => ({
      id: j.id,
      jobType: j.jobType,
      status: j.status,
      attempts: j.attempts,
      triggeredBy: j.triggeredBy,
      itemsProcessed: j.itemsProcessed,
      foldersExpired: j.foldersExpired,
      foldersPurged: j.foldersPurged,
      filesPurged: j.filesPurged,
      failedDeletions: j.failedDeletions,
      bytesReclaimed: j.bytesReclaimed.toString(),
      errorMessage: j.errorMessage,
      startedAt: j.startedAt?.toISOString() || null,
      completedAt: j.completedAt?.toISOString() || null,
      createdAt: j.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, jobs: formatted });
  } catch (error) {
    console.error("[GET /api/admin/cleanup Error]:", error);
    return NextResponse.json({ error: "Failed to load cleanup history" }, { status: 500 });
  }
}

/**
 * POST /api/admin/cleanup
 * Trigger an immediate automated cleanup run
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (!session?.userId || session.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin access required", code: "FORBIDDEN" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const isRetry = Boolean(body?.retryFailed);

    if (isRetry) {
      // Clear exponential backoff timer on failed files and folders so they are retried immediately
      await Promise.all([
        prisma.folder.updateMany({
          where: {
            OR: [{ lastPurgeError: { not: null } }, { purgeAttempts: { gt: 0 } }],
          },
          data: { nextPurgeAttemptAt: null },
        }),
        prisma.file.updateMany({
          where: {
            OR: [{ lastPurgeError: { not: null } }, { purgeAttempts: { gt: 0 } }],
          },
          data: { nextPurgeAttemptAt: null },
        }),
      ]);
    }

    // Optional client-supplied key lets a double-click / retried request reuse the same job
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
    const result = await runCleanupJob({
      jobType: isRetry ? "MANUAL_ADMIN_RETRY" : "MANUAL_ADMIN_TRIGGER",
      triggeredBy: session.userId,
      idempotencyKey,
    });

    // Audit logging
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: isRetry ? "CLEANUP_RETRY_TRIGGERED" : "CLEANUP_JOB_TRIGGERED",
        metadata: JSON.stringify({
          jobId: result.jobId,
          status: result.status,
          success: result.success,
          isRetry,
        }),
      },
    }).catch(() => null);

    return NextResponse.json({ success: result.success, result: serializeCleanupResult(result) });
  } catch (error) {
    console.error("[POST /api/admin/cleanup Error]:", error);
    return NextResponse.json({ error: "Cleanup execution failed" }, { status: 500 });
  }
}
