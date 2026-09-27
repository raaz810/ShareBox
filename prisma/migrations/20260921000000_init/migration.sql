-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FolderVisibility" AS ENUM ('PUBLIC', 'PASSWORD_PROTECTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('INITIATED', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'ABORTED');

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('VIEW', 'DOWNLOAD', 'UPLOAD', 'MANAGE');

-- CreateEnum
CREATE TYPE "CleanupJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "folderCode" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "description" TEXT,
    "ownershipTokenHash" TEXT NOT NULL,
    "passwordHash" TEXT,
    "visibility" "FolderVisibility" NOT NULL DEFAULT 'PUBLIC',
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "totalSize" BIGINT NOT NULL DEFAULT 0,
    "fileCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "checksum" TEXT,
    "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folder_permissions" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "permission" "PermissionType" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folder_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "totalFilesExpected" INTEGER NOT NULL DEFAULT 1,
    "totalBytesExpected" BIGINT NOT NULL DEFAULT 0,
    "status" "SessionStatus" NOT NULL DEFAULT 'INITIATED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cleanup_jobs" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" "CleanupJobStatus" NOT NULL DEFAULT 'PENDING',
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "bytesReclaimed" BIGINT NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cleanup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "folderId" TEXT,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "folders_folderCode_key" ON "folders"("folderCode");

-- CreateIndex
CREATE INDEX "folders_folderCode_idx" ON "folders"("folderCode");

-- CreateIndex
CREATE INDEX "folders_expiresAt_idx" ON "folders"("expiresAt");

-- CreateIndex
CREATE INDEX "folders_userId_idx" ON "folders"("userId");

-- CreateIndex
CREATE INDEX "folders_deletedAt_idx" ON "folders"("deletedAt");

-- CreateIndex
CREATE INDEX "folders_createdAt_idx" ON "folders"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "files_storageKey_key" ON "files"("storageKey");

-- CreateIndex
CREATE INDEX "files_folderId_idx" ON "files"("folderId");

-- CreateIndex
CREATE INDEX "files_uploadStatus_idx" ON "files"("uploadStatus");

-- CreateIndex
CREATE INDEX "files_deletedAt_idx" ON "files"("deletedAt");

-- CreateIndex
CREATE INDEX "files_createdAt_idx" ON "files"("createdAt");

-- CreateIndex
CREATE INDEX "folder_permissions_folderId_idx" ON "folder_permissions"("folderId");

-- CreateIndex
CREATE INDEX "folder_permissions_userId_idx" ON "folder_permissions"("userId");

-- CreateIndex
CREATE INDEX "folder_permissions_email_idx" ON "folder_permissions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "folder_permissions_folderId_userId_key" ON "folder_permissions"("folderId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "upload_sessions_sessionToken_key" ON "upload_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "upload_sessions_folderId_idx" ON "upload_sessions"("folderId");

-- CreateIndex
CREATE INDEX "upload_sessions_sessionToken_idx" ON "upload_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "upload_sessions_expiresAt_idx" ON "upload_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_tokenHash_idx" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "cleanup_jobs_status_idx" ON "cleanup_jobs"("status");

-- CreateIndex
CREATE INDEX "cleanup_jobs_jobType_idx" ON "cleanup_jobs"("jobType");

-- CreateIndex
CREATE INDEX "cleanup_jobs_createdAt_idx" ON "cleanup_jobs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "system_settings_key_idx" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_folderId_idx" ON "audit_logs"("folderId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_permissions" ADD CONSTRAINT "folder_permissions_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folder_permissions" ADD CONSTRAINT "folder_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
