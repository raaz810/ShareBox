-- CreateEnum
CREATE TYPE "FolderStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DELETED');

-- AlterEnum
ALTER TYPE "CleanupJobStatus" ADD VALUE 'PARTIAL';

-- AlterTable
ALTER TABLE "cleanup_jobs" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "failedDeletions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "filesPurged" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "foldersExpired" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "foldersPurged" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "lockKey" TEXT,
ADD COLUMN     "metadata" TEXT,
ADD COLUMN     "triggeredBy" TEXT;

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "lastPurgeError" TEXT,
ADD COLUMN     "nextPurgeAttemptAt" TIMESTAMP(3),
ADD COLUMN     "purgeAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "expiryWarningSentAt" TIMESTAMP(3),
ADD COLUMN     "lastPurgeError" TEXT,
ADD COLUMN     "nextPurgeAttemptAt" TIMESTAMP(3),
ADD COLUMN     "purgeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "FolderStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "cleanup_jobs_lockKey_key" ON "cleanup_jobs"("lockKey");

-- CreateIndex
CREATE UNIQUE INDEX "cleanup_jobs_idempotencyKey_key" ON "cleanup_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "folders_status_nextPurgeAttemptAt_idx" ON "folders"("status", "nextPurgeAttemptAt");


-- Backfill: folders soft-deleted before this migration are DELETED (access already blocked).
-- Already-expired ACTIVE folders are flipped to EXPIRED by the next cleanup run.
UPDATE "folders" SET "status" = 'DELETED' WHERE "deletedAt" IS NOT NULL;

-- Legacy jobs stuck in RUNNING never held a lock; close them so history stays truthful.
UPDATE "cleanup_jobs"
SET "status" = 'FAILED', "errorMessage" = COALESCE("errorMessage", 'Closed by migration: job never completed'), "completedAt" = NOW()
WHERE "status" = 'RUNNING';
