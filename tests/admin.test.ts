/**
 * Part 8 integration tests: Admin Dashboard & Role-based Authorization.
 * Runs against the real DATABASE_URL and tests all admin API endpoints.
 * Test data is prefixed "vitest-p8-" and cleaned up after execution.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { FolderStatus, FolderVisibility, UserRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { createSessionToken, AUTH_COOKIE_NAME, hashPassword, hashToken, generateRandomToken } from "@/lib/auth";
import { generateUniqueFolderCode } from "@/lib/folder";

import { GET as getStatsRoute } from "@/app/api/admin/stats/route";
import { GET as getUsersRoute } from "@/app/api/admin/users/route";
import { GET as getUserByIdRoute, PATCH as patchUserRoute } from "@/app/api/admin/users/[id]/route";
import { GET as getFoldersRoute } from "@/app/api/admin/folders/route";
import { GET as getFolderByCodeRoute } from "@/app/api/admin/folders/[code]/route";
import { GET as getSettingsRoute, PATCH as patchSettingsRoute } from "@/app/api/admin/settings/route";
import { GET as getCleanupRoute, POST as postCleanupRoute } from "@/app/api/admin/cleanup/route";
import { GET as getErrorsRoute } from "@/app/api/admin/errors/route";

const PREFIX = "vitest-p8-";
const BASE = "http://localhost:3000";

function request(
  url: string,
  init: { method?: string; body?: unknown; cookie?: string; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url.startsWith("http") ? url : `${BASE}${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe("Part 8: Admin Dashboard & Authorization", () => {
  let regularUser: { id: string; email: string; cookie: string };
  let adminUser: { id: string; email: string; cookie: string };
  let testFolderId: string;
  let testFolderCode: string;
  let testFileId: string;

  beforeAll(async () => {
    // 1. Create regular user
    const regPasswordHash = await hashPassword("RegularPass123!");
    const regEmail = `${PREFIX}regular-${Date.now()}@example.com`;
    const regRecord = await prisma.user.create({
      data: {
        email: regEmail,
        name: "Test Regular User",
        passwordHash: regPasswordHash,
        role: UserRole.USER,
        isActive: true,
      },
    });
    const regToken = await createSessionToken({
      userId: regRecord.id,
      email: regRecord.email,
      role: "USER",
      name: regRecord.name,
    });
    regularUser = { id: regRecord.id, email: regRecord.email, cookie: `${AUTH_COOKIE_NAME}=${regToken}` };

    // 2. Create admin user
    const adminPasswordHash = await hashPassword("AdminPass123!");
    const adminEmail = `${PREFIX}admin-${Date.now()}@example.com`;
    const adminRecord = await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Test Admin User",
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    const adminToken = await createSessionToken({
      userId: adminRecord.id,
      email: adminRecord.email,
      role: "ADMIN",
      name: adminRecord.name,
    });
    adminUser = { id: adminRecord.id, email: adminRecord.email, cookie: `${AUTH_COOKIE_NAME}=${adminToken}` };

    // 3. Create test folder with a file
    testFolderCode = await generateUniqueFolderCode(prisma);
    const folder = await prisma.folder.create({
      data: {
        folderCode: testFolderCode,
        folderName: `${PREFIX}AdminTestFolder`,
        ownershipTokenHash: hashToken(generateRandomToken(16)),
        visibility: FolderVisibility.PUBLIC,
        userId: regularUser.id,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        status: FolderStatus.ACTIVE,
        totalSize: BigInt(1024),
        fileCount: 1,
      },
    });
    testFolderId = folder.id;

    const file = await prisma.file.create({
      data: {
        folderId: folder.id,
        originalFileName: "document.pdf",
        storageKey: `${PREFIX}files/${folder.id}/test.pdf`,
        mimeType: "application/pdf",
        fileSize: BigInt(1024),
        uploadStatus: "COMPLETED",
        checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    });
    testFileId = file.id;

    // 4. Create a failed file upload for statistics & error checking
    await prisma.file.create({
      data: {
        folderId: folder.id,
        originalFileName: "corrupted.zip",
        storageKey: `${PREFIX}files/${folder.id}/corrupted.zip`,
        mimeType: "application/zip",
        fileSize: BigInt(2048),
        uploadStatus: "FAILED",
      },
    });
  });

  afterAll(async () => {
    // Clean up all vitest-p8 test records
    await prisma.file.deleteMany({
      where: { storageKey: { startsWith: PREFIX } },
    });
    await prisma.folder.deleteMany({
      where: { folderName: { startsWith: PREFIX } },
    });
    await prisma.auditLog.deleteMany({
      where: { user: { email: { startsWith: PREFIX } } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: PREFIX } },
    });
  });

  describe("Role-based Admin Authorization", () => {
    it("denies unauthenticated requests with 403 Forbidden", async () => {
      const res = await getStatsRoute(request("/api/admin/stats"));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Admin access required");
    });

    it("denies regular USER users with 403 Forbidden", async () => {
      const res = await getStatsRoute(request("/api/admin/stats", { cookie: regularUser.cookie }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Admin access required");
    });

    it("allows ADMIN users with 200 OK", async () => {
      const res = await getStatsRoute(request("/api/admin/stats", { cookie: adminUser.cookie }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.stats).toBeDefined();
    });
  });

  describe("Dashboard Statistics (Real Database Data)", () => {
    it("returns all 7 requested platform statistics", async () => {
      const res = await getStatsRoute(request("/api/admin/stats", { cookie: adminUser.cookie }));
      expect(res.status).toBe(200);
      const { stats } = await res.json();

      // Verify all 7 required metrics are present and non-negative
      expect(stats.totalUsers).toBeGreaterThanOrEqual(2); // at least regularUser and adminUser
      expect(stats.activeFolders).toBeGreaterThanOrEqual(1);
      expect(stats.totalFiles).toBeGreaterThanOrEqual(2);
      expect(typeof stats.totalStorageBytes).toBe("string");
      expect(stats.expiredFoldersAwaitingCleanup).toBeGreaterThanOrEqual(0);
      expect(stats.failedCleanupJobs).toBeGreaterThanOrEqual(0);
      expect(stats.uploadFailures).toBeGreaterThanOrEqual(1); // our test failed file
    });
  });

  describe("Admin Controls: Users", () => {
    it("lists users and searches by email", async () => {
      const res = await getUsersRoute(
        request(`/api/admin/users?search=${encodeURIComponent(regularUser.email)}`, { cookie: adminUser.cookie })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.users.length).toBe(1);
      expect(data.users[0].email).toBe(regularUser.email);
      expect(data.users[0].folderCount).toBeGreaterThanOrEqual(1);
      // Security: never display password hashes
      expect(data.users[0].passwordHash).toBeUndefined();
    });

    it("views basic metadata for an individual user without exposing password hash", async () => {
      const res = await getUserByIdRoute(request(`/api/admin/users/${regularUser.id}`, { cookie: adminUser.cookie }), {
        params: { id: regularUser.id },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.id).toBe(regularUser.id);
      expect(data.user.email).toBe(regularUser.email);
      expect(data.user.passwordHash).toBeUndefined();
      expect(data.user.folders.length).toBeGreaterThanOrEqual(1);
    });

    it("suspends abusive account and creates audit log", async () => {
      const patchRes = await patchUserRoute(
        request(`/api/admin/users/${regularUser.id}`, {
          method: "PATCH",
          cookie: adminUser.cookie,
          body: { isActive: false, reason: "Abusive automated file spam" },
        }),
        { params: { id: regularUser.id } }
      );
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.user.isActive).toBe(false);

      // Verify in database
      const dbUser = await prisma.user.findUnique({ where: { id: regularUser.id } });
      expect(dbUser?.isActive).toBe(false);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: "USER_SUSPENDED" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeDefined();
      expect(audit?.userId).toBe(adminUser.id);
      expect(audit?.metadata).toContain(regularUser.email);
    });

    it("reactivates suspended account", async () => {
      const patchRes = await patchUserRoute(
        request(`/api/admin/users/${regularUser.id}`, {
          method: "PATCH",
          cookie: adminUser.cookie,
          body: { isActive: true },
        }),
        { params: { id: regularUser.id } }
      );
      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.user.isActive).toBe(true);

      const dbUser = await prisma.user.findUnique({ where: { id: regularUser.id } });
      expect(dbUser?.isActive).toBe(true);
    });

    it("prevents admin from suspending themselves", async () => {
      const res = await patchUserRoute(
        request(`/api/admin/users/${adminUser.id}`, {
          method: "PATCH",
          cookie: adminUser.cookie,
          body: { isActive: false },
        }),
        { params: { id: adminUser.id } }
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("SELF_SUSPENSION");
    });
  });

  describe("Admin Controls: Folder Metadata (Restricted Content Access)", () => {
    it("lists folders and searches by folderCode", async () => {
      const res = await getFoldersRoute(
        request(`/api/admin/folders?search=${testFolderCode}`, { cookie: adminUser.cookie })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.folders.length).toBe(1);
      expect(data.folders[0].folderCode).toBe(testFolderCode);
      expect(data.folders[0].status).toBe("ACTIVE");
      expect(data.folders[0].owner.email).toBe(regularUser.email);
      // Security: never return folder password hashes or ownership token hashes
      expect(data.folders[0].passwordHash).toBeUndefined();
      expect(data.folders[0].ownershipTokenHash).toBeUndefined();
    });

    it("inspects folder metadata and restricts raw file content / storage secrets", async () => {
      const res = await getFolderByCodeRoute(
        request(`/api/admin/folders/${testFolderCode}`, { cookie: adminUser.cookie }),
        { params: { code: testFolderCode } }
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.folder.folderCode).toBe(testFolderCode);
      expect(data.folder.files.length).toBeGreaterThanOrEqual(1);

      const file = data.folder.files.find((f: { originalFileName: string }) => f.originalFileName === "document.pdf");
      expect(file).toBeDefined();
      expect(file.mimeType).toBe("application/pdf");
      expect(file.checksum).toBeDefined();

      // SECURITY CHECKS:
      // 1. Password hashes must NOT be exposed
      expect(data.folder.passwordHash).toBeUndefined();
      expect(data.folder.ownershipTokenHash).toBeUndefined();
      // 2. Storage credentials and raw storage keys must NOT be exposed
      expect(file.storageKey).toBeUndefined();
      expect(file.downloadUrl).toBeUndefined();
    });
  });

  describe("Admin Controls: System Settings", () => {
    it("includes all 8 requested platform settings", async () => {
      const res = await getSettingsRoute(request("/api/admin/settings", { cookie: adminUser.cookie }));
      expect(res.status).toBe(200);
      const data = await res.json();
      const keys = data.settings.map((s: { key: string }) => s.key);

      expect(keys).toContain("max_file_size_mb");
      expect(keys).toContain("max_files_per_folder");
      expect(keys).toContain("max_folder_storage_mb");
      expect(keys).toContain("max_concurrent_uploads");
      expect(keys).toContain("max_video_size_mb");
      expect(keys).toContain("guest_folder_lifespan_hours");
      expect(keys).toContain("user_folder_lifespan_days");
      expect(keys).toContain("supported_file_types");
    });

    it("updates settings and logs audit trail", async () => {
      const updateRes = await patchSettingsRoute(
        request("/api/admin/settings", {
          method: "PATCH",
          cookie: adminUser.cookie,
          body: {
            updates: [
              { key: "max_concurrent_uploads", value: "5" },
              { key: "max_video_size_mb", value: "300" },
            ],
          },
        })
      );
      expect(updateRes.status).toBe(200);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: "SYSTEM_SETTINGS_UPDATED" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).toBeDefined();
      expect(audit?.userId).toBe(adminUser.id);

      // Clean up values back to default
      await patchSettingsRoute(
        request("/api/admin/settings", {
          method: "PATCH",
          cookie: adminUser.cookie,
          body: {
            updates: [
              { key: "max_concurrent_uploads", value: "3" },
              { key: "max_video_size_mb", value: "250" },
            ],
          },
        })
      );
    });
  });

  describe("Admin Controls: Cleanup Monitoring & Retry", () => {
    it("lists cleanup jobs history", async () => {
      const res = await getCleanupRoute(request("/api/admin/cleanup", { cookie: adminUser.cookie }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.jobs)).toBe(true);
    });

    it("triggers cleanup and retries failed cleanups", async () => {
      const res = await postCleanupRoute(
        request("/api/admin/cleanup", {
          method: "POST",
          cookie: adminUser.cookie,
          body: { retryFailed: true },
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.jobId).toBeDefined();
    });
  });

  describe("Admin Controls: Error Logs", () => {
    it("returns real database upload failures and operational errors", async () => {
      const res = await getErrorsRoute(request("/api/admin/errors", { cookie: adminUser.cookie }));
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.success).toBe(true);
      expect(data.summary).toBeDefined();
      expect(Array.isArray(data.uploadErrors)).toBe(true);
      expect(Array.isArray(data.operationalErrors)).toBe(true);

      // Verify the failed file we created is listed under uploadErrors
      const foundFailed = data.uploadErrors.find((e: { title: string }) => e.title === "corrupted.zip");
      expect(foundFailed).toBeDefined();
      expect(foundFailed.status).toBe("FAILED");
    });
  });
});
