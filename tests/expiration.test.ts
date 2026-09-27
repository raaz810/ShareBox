/**
 * Part 7 integration tests: expiration + cleanup.
 * Runs against the DATABASE_URL database and the local-disk storage provider, and calls
 * the real Next.js route handlers. Test data is prefixed "vitest-p7-" and removed afterwards.
 *
 *   npm test
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { CleanupJobStatus, FolderStatus, FolderVisibility, SystemSetting } from "@prisma/client";
import prisma from "@/lib/prisma";
import { createSessionToken, AUTH_COOKIE_NAME, hashToken, generateRandomToken, hashPassword } from "@/lib/auth";
import { generateUniqueFolderCode } from "@/lib/folder";
import { storageService, StorageService } from "@/lib/storage";
import { getDerivedStorageKeys } from "@/lib/storage-config";
import {
  computeExpirationStatus,
  computeExpiresAt,
  getRetentionPolicy,
  getServerNow,
  setTestClockOffsetSeconds,
  SETTING_KEYS,
} from "@/lib/expiration";
import { runCleanupJob, sendExpirationWarnings } from "@/lib/cleanup";
import type { ExpiryWarningMessage, NotificationProvider } from "@/lib/notifications";

import { POST as createFolderRoute } from "@/app/api/folders/route";
import { GET as getFolderRoute } from "@/app/api/folders/[code]/route";
import { POST as claimFolderRoute } from "@/app/api/folders/[code]/claim/route";
import { GET as getFileUrlRoute } from "@/app/api/files/[fileId]/route";
import { GET as previewRoute } from "@/app/api/files/[fileId]/preview/route";
import { GET as signedDownloadRoute } from "@/app/api/files/download/route";
import { PATCH as patchSettingsRoute } from "@/app/api/admin/settings/route";

const PREFIX = "vitest-p7-";
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const BASE = "http://localhost:3000";

// ─── helpers ─────────────────────────────────────────────────────────────────

function request(url: string, init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url.startsWith("http") ? url : `${BASE}${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

let testUser: { id: string; email: string; cookie: string };
let adminCookie: string;

async function makeFolder(opts: { expiresInMs: number; userId?: string | null; status?: FolderStatus }) {
  const now = await getServerNow();
  return prisma.folder.create({
    data: {
      folderCode: await generateUniqueFolderCode(prisma),
      folderName: `${PREFIX}${Math.random().toString(36).slice(2, 8)}`,
      ownershipTokenHash: hashToken(generateRandomToken(16)),
      visibility: FolderVisibility.PUBLIC,
      userId: opts.userId ?? null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + opts.expiresInMs),
      status: opts.status ?? FolderStatus.ACTIVE,
    },
  });
}

/** Uploads an original plus its thumbnail/preview objects and creates the File row. */
async function makeFile(folderId: string, mimeType = "image/png") {
  const storageKey = `${PREFIX}${folderId}/${generateRandomToken(8)}.png`;
  const body = Buffer.from("vitest part 7 payload");
  for (const key of [storageKey, ...getDerivedStorageKeys(storageKey)]) {
    await storageService.upload({ key, body, contentType: mimeType, contentLength: body.length });
  }
  const file = await prisma.file.create({
    data: {
      folderId,
      originalFileName: "photo.png",
      storageKey,
      mimeType,
      fileSize: BigInt(body.length),
      uploadStatus: "COMPLETED",
    },
  });
  await prisma.folder.update({ where: { id: folderId }, data: { fileCount: 1, totalSize: BigInt(body.length) } });
  return file;
}

async function allObjectsExist(storageKey: string) {
  const keys = [storageKey, ...getDerivedStorageKeys(storageKey)];
  return Promise.all(keys.map((k) => storageService.exists(k)));
}

/** Storage wrapper that fails deletes for chosen keys, or blocks them until released. */
class ControllableStorage implements StorageService {
  readonly providerName = "TEST";
  failKeys = new Set<string>();
  gate: Promise<void> | null = null;
  deleteCalls: string[] = [];
  constructor(private inner: StorageService) {}
  upload = (o: Parameters<StorageService["upload"]>[0]) => this.inner.upload(o);
  getSignedDownloadUrl = (o: Parameters<StorageService["getSignedDownloadUrl"]>[0]) => this.inner.getSignedDownloadUrl(o);
  getFile = (k: string) => this.inner.getFile(k);
  exists = (k: string) => this.inner.exists(k);
  async delete(key: string) {
    this.deleteCalls.push(key);
    if (this.gate) await this.gate;
    if (this.failKeys.has(key)) throw new Error("simulated storage outage");
    return this.inner.delete(key);
  }
}

const silentNotifier: NotificationProvider = { name: "test-silent", sendExpiryWarning: async () => undefined };

// ─── setup / teardown ────────────────────────────────────────────────────────

const RETENTION_KEYS = [
  SETTING_KEYS.guestRetentionHours,
  SETTING_KEYS.userRetentionDays,
  SETTING_KEYS.guestExpiringSoonHours,
  SETTING_KEYS.userExpiringSoonHours,
  SETTING_KEYS.testClockOffsetSeconds,
];
let savedSettings: SystemSetting[] = [];

beforeAll(async () => {
  // Run against the documented defaults (24h / 15d), restoring any custom dev values afterwards
  savedSettings = await prisma.systemSetting.findMany({ where: { key: { in: RETENTION_KEYS } } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: RETENTION_KEYS } } });

  const email = `${PREFIX}${generateRandomToken(4)}@example.test`;
  const user = await prisma.user.create({
    data: { email, name: "Vitest P7", passwordHash: await hashPassword("irrelevant-Pass1!") },
  });
  const token = await createSessionToken({ userId: user.id, email, role: "USER", name: user.name });
  testUser = { id: user.id, email, cookie: `${AUTH_COOKIE_NAME}=${token}` };

  const adminEmail = `${PREFIX}admin-${generateRandomToken(4)}@example.test`;
  const admin = await prisma.user.create({
    data: { email: adminEmail, role: "ADMIN", passwordHash: await hashPassword("irrelevant-Pass1!") },
  });
  adminCookie = `${AUTH_COOKIE_NAME}=${await createSessionToken({ userId: admin.id, email: adminEmail, role: "ADMIN" })}`;
});

afterEach(async () => {
  await setTestClockOffsetSeconds(0);
});

afterAll(async () => {
  const folders = await prisma.folder.findMany({ where: { folderName: { startsWith: PREFIX } }, include: { files: true } });
  for (const f of folders) for (const file of f.files) await storageService.delete(file.storageKey).catch(() => null);
  await prisma.folder.deleteMany({ where: { folderName: { startsWith: PREFIX } } });
  await prisma.cleanupJob.deleteMany({ where: { OR: [{ jobType: { startsWith: "TEST_" } }, { idempotencyKey: { startsWith: PREFIX } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: RETENTION_KEYS } } });
  for (const s of savedSettings) {
    await prisma.systemSetting.create({ data: { key: s.key, value: s.value, description: s.description, isPublic: s.isPublic } });
  }
  await prisma.$disconnect();
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe("expiration timestamps (server-side, UTC)", () => {
  it("guest folder expires at createdAt + 24 hours", async () => {
    const res = await createFolderRoute(request("/api/folders", { method: "POST", body: { folderName: `${PREFIX}guest` } }));
    expect(res.status).toBe(201);
    const { folder } = await res.json();
    expect(new Date(folder.expiresAt).getTime() - new Date(folder.createdAt).getTime()).toBe(24 * HOUR);
    expect(folder.expiresAt).toMatch(/Z$/); // ISO-8601 UTC
    expect(folder.expirationState).toBe("ACTIVE");
    expect(folder.serverTime).toBeTruthy();
  });

  it("registered folder expires at createdAt + 15 days", async () => {
    const res = await createFolderRoute(
      request("/api/folders", { method: "POST", body: { folderName: `${PREFIX}registered` }, cookie: testUser.cookie })
    );
    expect(res.status).toBe(201);
    const { folder } = await res.json();
    expect(folder.isRegistered).toBe(true);
    expect(new Date(folder.expiresAt).getTime() - new Date(folder.createdAt).getTime()).toBe(15 * DAY);
  });

  it("claiming a guest folder sets expiry to its createdAt + 15 days", async () => {
    const res = await createFolderRoute(request("/api/folders", { method: "POST", body: { folderName: `${PREFIX}claim` } }));
    const { folder, ownershipToken } = await res.json();
    const claim = await claimFolderRoute(
      request(`/api/folders/${folder.folderCode}/claim`, { method: "POST", body: { ownershipToken }, cookie: testUser.cookie }),
      { params: { code: folder.folderCode } }
    );
    expect(claim.status).toBe(200);
    const row = await prisma.folder.findUniqueOrThrow({ where: { folderCode: folder.folderCode } });
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(15 * DAY);
  });

  it("claiming never shortens the current expiry", async () => {
    await prisma.systemSetting.create({ data: { key: SETTING_KEYS.userRetentionDays, value: "0.01" } }); // ~14 min
    try {
      const res = await createFolderRoute(request("/api/folders", { method: "POST", body: { folderName: `${PREFIX}claim-short` } }));
      const { folder, ownershipToken } = await res.json();
      const claim = await claimFolderRoute(
        request(`/api/folders/${folder.folderCode}/claim`, { method: "POST", body: { ownershipToken }, cookie: testUser.cookie }),
        { params: { code: folder.folderCode } }
      );
      expect(claim.status).toBe(200);
      const row = await prisma.folder.findUniqueOrThrow({ where: { folderCode: folder.folderCode } });
      expect(row.expiresAt.toISOString()).toBe(folder.expiresAt);
    } finally {
      await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.userRetentionDays } });
    }
  });

  it("admin settings PATCH validates values and creates unseeded keys", async () => {
    const patch = (updates: unknown) =>
      patchSettingsRoute(request("/api/admin/settings", { method: "PATCH", body: { updates }, cookie: adminCookie }));

    // One invalid entry rejects the whole batch
    const bad = await patch([
      { key: SETTING_KEYS.guestExpiringSoonHours, value: "3" },
      { key: SETTING_KEYS.guestRetentionHours, value: "-5" },
    ]);
    expect(bad.status).toBe(400);
    expect(await prisma.systemSetting.findUnique({ where: { key: SETTING_KEYS.guestExpiringSoonHours } })).toBeNull();

    expect((await patch([{ key: "made_up_key", value: "1" }])).status).toBe(400);
    expect((await patch([{ key: SETTING_KEYS.testClockOffsetSeconds, value: "999" }])).status).toBe(400);

    // Key was never seeded (removed in beforeAll) — upsert creates it
    const ok = await patch([{ key: SETTING_KEYS.guestExpiringSoonHours, value: "3" }]);
    expect(ok.status).toBe(200);
    expect((await getRetentionPolicy()).guestExpiringSoonMs).toBe(3 * HOUR);
    await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.guestExpiringSoonHours } });
  });

  it("retention is configurable through SystemSetting", async () => {
    await prisma.systemSetting.create({ data: { key: SETTING_KEYS.guestRetentionHours, value: "0.5" } });
    try {
      const policy = await getRetentionPolicy();
      expect(policy.guestRetentionMs).toBe(30 * 60 * 1000);
      const created = new Date("2026-01-01T00:00:00Z");
      expect(computeExpiresAt(created, false, policy).toISOString()).toBe("2026-01-01T00:30:00.000Z");
    } finally {
      await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.guestRetentionHours } });
    }
  });

  it("invalid retention settings fall back to defaults", async () => {
    await prisma.systemSetting.create({ data: { key: SETTING_KEYS.userRetentionDays, value: "not-a-number" } });
    try {
      expect((await getRetentionPolicy()).userRetentionMs).toBe(15 * DAY);
    } finally {
      await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEYS.userRetentionDays } });
    }
  });
});

describe("expiration states", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  const at = (ms: number) => new Date(now.getTime() + ms);

  it("ACTIVE / EXPIRING_SOON / EXPIRED for guests (2h window)", () => {
    expect(computeExpirationStatus(at(3 * HOUR), now, true).state).toBe("ACTIVE");
    expect(computeExpirationStatus(at(2 * HOUR), now, true).state).toBe("EXPIRING_SOON");
    expect(computeExpirationStatus(at(1), now, true).state).toBe("EXPIRING_SOON");
    expect(computeExpirationStatus(at(0), now, true).state).toBe("EXPIRED"); // expiresAt <= now
    expect(computeExpirationStatus(at(-1), now, true).state).toBe("EXPIRED");
  });

  it("registered folders use a 24h EXPIRING_SOON window", () => {
    expect(computeExpirationStatus(at(25 * HOUR), now, false).state).toBe("ACTIVE");
    expect(computeExpirationStatus(at(23 * HOUR), now, false).state).toBe("EXPIRING_SOON");
    expect(computeExpirationStatus(at(23 * HOUR), now, true).state).toBe("ACTIVE");
  });
});

describe("access is denied by the backend as soon as expiresAt <= server time", () => {
  it("expired folder returns 410 even before cleanup has run", async () => {
    const folder = await makeFolder({ expiresInMs: -1000 });
    expect(folder.status).toBe(FolderStatus.ACTIVE); // cleanup has not marked it
    const res = await getFolderRoute(request(`/api/folders/${folder.folderCode}`), { params: { code: folder.folderCode } });
    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("EXPIRED");
  });

  it("folder marked EXPIRED is denied regardless of expiresAt", async () => {
    const folder = await makeFolder({ expiresInMs: HOUR, status: FolderStatus.EXPIRED });
    const res = await getFolderRoute(request(`/api/folders/${folder.folderCode}`), { params: { code: folder.folderCode } });
    expect(res.status).toBe(410);
  });

  it("test clock moves expiry without waiting", async () => {
    const folder = await makeFolder({ expiresInMs: HOUR });
    const get = () => getFolderRoute(request(`/api/folders/${folder.folderCode}`), { params: { code: folder.folderCode } });

    const before = await get();
    expect(before.status).toBe(200);
    expect((await before.json()).folder.expirationState).toBe("EXPIRING_SOON"); // guest, < 2h left

    await setTestClockOffsetSeconds(2 * 3600);
    expect((await get()).status).toBe(410);

    await setTestClockOffsetSeconds(0);
    expect((await get()).status).toBe(200);
  });
});

describe("expired file download", () => {
  it("download URL, preview and an already-issued signed link all stop working at expiry", async () => {
    const folder = await makeFolder({ expiresInMs: HOUR });
    const file = await makeFile(folder.id);
    const params = { params: { fileId: file.id } };

    const issued = await getFileUrlRoute(request(`/api/files/${file.id}`), params);
    expect(issued.status).toBe(200);
    const { downloadUrl } = await issued.json();
    expect((await signedDownloadRoute(request(downloadUrl))).status).toBe(200);

    await prisma.folder.update({ where: { id: folder.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await getFileUrlRoute(request(`/api/files/${file.id}`), params)).status).toBe(410);
    expect((await previewRoute(request(`/api/files/${file.id}/preview`), params)).status).toBe(410);
    // The signature is still valid, but the backend re-checks the folder at serve time
    expect((await signedDownloadRoute(request(downloadUrl))).status).toBe(410);
  });

  it("signed URL lifetime is capped at the folder's remaining lifetime", async () => {
    const folder = await makeFolder({ expiresInMs: 30 * 1000 });
    const file = await makeFile(folder.id);
    const res = await getFileUrlRoute(request(`/api/files/${file.id}`), { params: { fileId: file.id } });
    const body = await res.json();
    expect(body.expiresInSeconds).toBeLessThanOrEqual(30);
    expect(body.expiresInSeconds).toBeGreaterThan(0);
  });
});

describe("cleanup job", () => {
  it("marks expired, deletes originals + thumbnails/previews, removes DB rows", async () => {
    const folder = await makeFolder({ expiresInMs: -1000 });
    const file = await makeFile(folder.id);
    expect(await allObjectsExist(file.storageKey)).toEqual([true, true, true]);

    const result = await runCleanupJob({ jobType: "TEST_PURGE", notifier: silentNotifier });

    expect(result.status).toBe(CleanupJobStatus.COMPLETED);
    expect(result.foldersExpired).toBeGreaterThanOrEqual(1);
    expect(await allObjectsExist(file.storageKey)).toEqual([false, false, false]);
    expect(await prisma.file.findUnique({ where: { id: file.id } })).toBeNull();
    expect(await prisma.folder.findUnique({ where: { id: folder.id } })).toBeNull();

    const job = await prisma.cleanupJob.findUniqueOrThrow({ where: { id: result.jobId } });
    expect(job.lockKey).toBeNull();
    expect(job.completedAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: "FOLDER_EXPIRED_PURGED", metadata: { contains: folder.folderCode } },
    });
    expect(audit).not.toBeNull();
  });

  it("owner-deleted folders are purged too", async () => {
    const folder = await makeFolder({ expiresInMs: DAY });
    const file = await makeFile(folder.id);
    await prisma.folder.update({ where: { id: folder.id }, data: { deletedAt: new Date(), status: FolderStatus.DELETED } });

    await runCleanupJob({ jobType: "TEST_DELETED", notifier: silentNotifier });

    expect(await storageService.exists(file.storageKey)).toBe(false);
    expect(await prisma.folder.findUnique({ where: { id: folder.id } })).toBeNull();
  });

  it("does not touch active folders", async () => {
    const folder = await makeFolder({ expiresInMs: DAY });
    const file = await makeFile(folder.id);
    await runCleanupJob({ jobType: "TEST_ACTIVE", notifier: silentNotifier });
    expect(await storageService.exists(file.storageKey)).toBe(true);
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } })).status).toBe(FolderStatus.ACTIVE);
  });

  it("storage failure keeps the record, blocks access, and succeeds on retry", async () => {
    const folder = await makeFolder({ expiresInMs: -1000 });
    const file = await makeFile(folder.id);
    const storage = new ControllableStorage(storageService);
    const thumbKey = getDerivedStorageKeys(file.storageKey)[0];
    storage.failKeys.add(thumbKey);

    const first = await runCleanupJob({ jobType: "TEST_FAIL", storage, notifier: silentNotifier });
    expect(first.status).toBe(CleanupJobStatus.PARTIAL);
    expect(first.failedDeletions).toBeGreaterThanOrEqual(1);

    const failedFile = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
    expect(failedFile.purgeAttempts).toBe(1);
    expect(failedFile.lastPurgeError).toContain("simulated storage outage");
    expect(failedFile.nextPurgeAttemptAt).not.toBeNull();
    const failedFolder = await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } });
    expect(failedFolder.status).toBe(FolderStatus.EXPIRED);
    expect(failedFolder.nextPurgeAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await storageService.exists(thumbKey)).toBe(true);

    const res = await getFolderRoute(request(`/api/folders/${folder.folderCode}`), { params: { code: folder.folderCode } });
    expect(res.status).toBe(410);

    // Backoff: an immediate re-run skips it
    storage.failKeys.clear();
    storage.deleteCalls = [];
    await runCleanupJob({ jobType: "TEST_BACKOFF", storage, notifier: silentNotifier });
    expect(storage.deleteCalls).not.toContain(file.storageKey);
    expect(await prisma.file.findUnique({ where: { id: file.id } })).not.toBeNull();

    // Once the backoff has elapsed the retry purges everything. (Simulated on these rows only;
    // advancing the global clock would also purge real dev folders.)
    const past = new Date(Date.now() - 1000);
    await prisma.folder.update({ where: { id: folder.id }, data: { nextPurgeAttemptAt: past } });
    await prisma.file.update({ where: { id: file.id }, data: { nextPurgeAttemptAt: past } });
    const retry = await runCleanupJob({ jobType: "TEST_RETRY", storage, notifier: silentNotifier });
    expect(retry.success).toBe(true);
    expect(await allObjectsExist(file.storageKey)).toEqual([false, false, false]);
    expect(await prisma.file.findUnique({ where: { id: file.id } })).toBeNull();
    expect(await prisma.folder.findUnique({ where: { id: folder.id } })).toBeNull();
  });

  it("is idempotent: a second run finds nothing to do and does not error", async () => {
    const folder = await makeFolder({ expiresInMs: -1000 });
    await makeFile(folder.id);
    const first = await runCleanupJob({ jobType: "TEST_IDEMP_1", notifier: silentNotifier });
    const second = await runCleanupJob({ jobType: "TEST_IDEMP_2", notifier: silentNotifier });
    expect(first.success && second.success).toBe(true);
    expect(await prisma.folder.findUnique({ where: { id: folder.id } })).toBeNull();
    expect(second.errors).toEqual([]);
  });

  it("a retried trigger with the same idempotency key reuses one job record", async () => {
    const key = `${PREFIX}tick-${generateRandomToken(4)}`;
    const a = await runCleanupJob({ jobType: "TEST_KEY", idempotencyKey: key, notifier: silentNotifier });
    const b = await runCleanupJob({ jobType: "TEST_KEY", idempotencyKey: key, notifier: silentNotifier });
    expect(b.jobId).toBe(a.jobId);
    expect(b.replayed).toBe(true);
    expect(await prisma.cleanupJob.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("concurrent triggers never run twice (database lock)", async () => {
    const folder = await makeFolder({ expiresInMs: -1000 });
    await makeFile(folder.id);
    const storage = new ControllableStorage(storageService);
    let release!: () => void;
    storage.gate = new Promise<void>((r) => (release = r));

    const firstRun = runCleanupJob({ jobType: "TEST_LOCK_A", storage, notifier: silentNotifier });
    // wait until run A is inside the storage phase (holding the lock)
    while (storage.deleteCalls.length === 0) await new Promise((r) => setTimeout(r, 10));

    const second = await runCleanupJob({ jobType: "TEST_LOCK_B", notifier: silentNotifier });
    expect(second.skipped).toBe(true);

    release();
    const first = await firstRun;
    expect(first.success).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(await prisma.cleanupJob.count({ where: { jobType: "TEST_LOCK_B" } })).toBe(0);
  });

  it("stops at its time budget and leaves the rest for the next run", async () => {
    const folder = await makeFolder({ expiresInMs: -1000 });
    const file = await makeFile(folder.id);

    const limited = await runCleanupJob({ jobType: "TEST_BUDGET", timeBudgetMs: 0, notifier: silentNotifier });
    expect(limited.status).toBe(CleanupJobStatus.PARTIAL);
    expect(await storageService.exists(file.storageKey)).toBe(true);
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } })).status).toBe(FolderStatus.EXPIRED);

    await runCleanupJob({ jobType: "TEST_BUDGET_2", notifier: silentNotifier });
    expect(await prisma.folder.findUnique({ where: { id: folder.id } })).toBeNull();
  });

  it("recovers from a stale lock left by a crashed worker", async () => {
    const stale = await prisma.cleanupJob.create({
      data: {
        jobType: "TEST_STALE",
        status: CleanupJobStatus.RUNNING,
        lockKey: "GLOBAL",
        startedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    const result = await runCleanupJob({ jobType: "TEST_AFTER_STALE", notifier: silentNotifier });
    expect(result.skipped).toBe(false);
    const closed = await prisma.cleanupJob.findUniqueOrThrow({ where: { id: stale.id } });
    expect(closed.status).toBe(CleanupJobStatus.FAILED);
    expect(closed.lockKey).toBeNull();
  });
});

describe("registered-user expiry warnings", () => {
  it("inactive accounts cannot block the warning queue", async () => {
    const inactive = await prisma.user.create({
      data: { email: `${PREFIX}inactive-${generateRandomToken(4)}@example.test`, isActive: false, passwordHash: "x" },
    });
    const now = await getServerNow();
    await prisma.folder.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        folderCode: `V7${generateRandomToken(3).slice(0, 6).toUpperCase()}${i}`.slice(0, 12),
        folderName: `${PREFIX}inactive-${i}`,
        ownershipTokenHash: hashToken(generateRandomToken(8)),
        userId: inactive.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000), // expire sooner than the active one
      })),
    });
    const target = await makeFolder({ expiresInMs: 3 * HOUR, userId: testUser.id });
    const got: string[] = [];
    await sendExpirationWarnings({ notifier: { name: "t", sendExpiryWarning: async (m) => void got.push(m.folderCode) } });
    expect(got).toContain(target.folderCode);
  });

  it("sends one warning per folder lifetime and retries after a delivery failure", async () => {
    const folder = await makeFolder({ expiresInMs: 3 * HOUR, userId: testUser.id });
    const sent: ExpiryWarningMessage[] = [];
    let fail = true;
    const notifier: NotificationProvider = {
      name: "test",
      async sendExpiryWarning(m) {
        if (m.folderCode !== folder.folderCode) return;
        if (fail) throw new Error("smtp down");
        sent.push(m);
      },
    };

    await sendExpirationWarnings({ notifier });
    expect(sent).toHaveLength(0);
    expect((await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } })).expiryWarningSentAt).toBeNull();

    fail = false;
    await sendExpirationWarnings({ notifier });
    await sendExpirationWarnings({ notifier });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(testUser.email);
  });
});
