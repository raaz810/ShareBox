import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runCleanupJob, serializeCleanupResult } from "@/lib/cleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET|POST /api/cron/cleanup
 * Scheduler entry point (Vercel Cron, GitHub Actions, system cron + curl, ...).
 *
 *   Authorization: Bearer $CRON_SECRET
 *   Idempotency-Key: <tick id>   (optional; a retried delivery of the same tick
 *                                 returns the original job instead of running again)
 *
 * Concurrent invocations are safe: only one run can hold the cleanup lock.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempotencyKey =
    req.headers.get("idempotency-key")?.trim() || req.nextUrl.searchParams.get("key")?.trim() || null;

  try {
    const result = await runCleanupJob({ jobType: "SCHEDULED_CLEANUP", triggeredBy: "cron", idempotencyKey });
    return NextResponse.json(
      { success: result.success, result: serializeCleanupResult(result) },
      { status: result.success ? 200 : 500 }
    );
  } catch (error) {
    console.error("[cron/cleanup] fatal:", error);
    return NextResponse.json({ error: "Cleanup failed to start" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
