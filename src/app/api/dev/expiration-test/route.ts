import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AUTH_COOKIE_NAME, verifySessionToken, hashToken, generateRandomToken } from "@/lib/auth";
import { generateUniqueFolderCode } from "@/lib/folder";
import { storageService } from "@/lib/storage";
import { getDerivedStorageKeys } from "@/lib/storage-config";
import { checkFolderAccess, computeExpiresAt, getRetentionPolicy, getServerNow } from "@/lib/expiration";
import { runCleanupJob } from "@/lib/cleanup";
import { FolderVisibility } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/expiration-test
 * In-app smoke test of the expiration pipeline (the full suite is `npm test`).
 * Creates an isolated expired folder, verifies access is denied, runs cleanup,
 * verifies storage + rows are gone, and re-runs cleanup to check idempotency.
 * Available in development, or to admins in production.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (process.env.NODE_ENV === "production" && session?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const check = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  try {
    const policy = await getRetentionPolicy(prisma);
    const now = await getServerNow(prisma);

    const guestExp = computeExpiresAt(now, false, policy).getTime() - now.getTime();
    const userExp = computeExpiresAt(now, true, policy).getTime() - now.getTime();
    check("guest retention", guestExp === policy.guestRetentionMs, `${guestExp / 3600000}h`);
    check("registered retention", userExp === policy.userRetentionMs, `${userExp / 86400000}d`);

    const folder = await prisma.folder.create({
      data: {
        folderCode: await generateUniqueFolderCode(prisma),
        folderName: "__expiration_smoke_test__",
        ownershipTokenHash: hashToken(generateRandomToken(16)),
        visibility: FolderVisibility.PUBLIC,
        createdAt: new Date(now.getTime() - 2000),
        expiresAt: new Date(now.getTime() - 1000),
      },
    });

    const storageKey = `smoke-test/${folder.id}/${generateRandomToken(8)}.txt`;
    const body = Buffer.from("expiration smoke test");
    for (const key of [storageKey, ...getDerivedStorageKeys(storageKey)]) {
      await storageService.upload({ key, body, contentType: "text/plain", contentLength: body.length });
    }
    await prisma.file.create({
      data: { folderId: folder.id, originalFileName: "smoke.txt", storageKey, mimeType: "text/plain", fileSize: BigInt(body.length) },
    });

    const access = await checkFolderAccess(folder, { policy });
    check("expired folder denied before cleanup", !access.ok && access.code === "EXPIRED");

    const first = await runCleanupJob({ jobType: "DEV_SMOKE_TEST", triggeredBy: session?.userId ?? "dev" });
    const objectsLeft = await Promise.all(
      [storageKey, ...getDerivedStorageKeys(storageKey)].map((k) => storageService.exists(k))
    );
    const folderLeft = await prisma.folder.findUnique({ where: { id: folder.id } });
    check("cleanup run", first.success && !first.skipped, first.skipped ? "another cleanup is running" : first.status);
    check("storage objects + thumbnails deleted", objectsLeft.every((e) => !e));
    check("folder and file rows removed", folderLeft === null);

    const second = await runCleanupJob({ jobType: "DEV_SMOKE_TEST_REPEAT", triggeredBy: session?.userId ?? "dev" });
    check("second run is a safe no-op", second.success && second.errors.length === 0);

    return NextResponse.json({ success: true, allPassed: checks.every((c) => c.pass), checks });
  } catch (error) {
    console.error("[POST /api/dev/expiration-test Error]:", error);
    return NextResponse.json(
      { error: "Smoke test failed", details: error instanceof Error ? error.message : "Unknown", checks },
      { status: 500 }
    );
  }
}
