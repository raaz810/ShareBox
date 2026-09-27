import { CleanupJob, CleanupJobStatus, File, FolderStatus, Prisma, PrismaClient } from "@prisma/client";
import defaultPrisma from "@/lib/prisma";
import { storageService as defaultStorage, StorageService } from "@/lib/storage";
import { getDerivedStorageKeys } from "@/lib/storage-config";
import { getFolderShareUrl } from "@/lib/folder";
import { getRetentionPolicy, getServerNow, RetentionPolicy } from "@/lib/expiration";
import { getNotificationProvider, NotificationProvider } from "@/lib/notifications";

/**
 * Expiration & cleanup engine (Part 7).
 *
 * Lifecycle: ACTIVE --(expiresAt <= now)--> EXPIRED --(storage purged)--> row deleted
 *            ACTIVE --(owner deletes)-----> DELETED --(storage purged)--> row deleted
 *
 * Access is already denied by checkFolderAccess() the instant expiresAt <= now;
 * this job makes that durable (status = EXPIRED) and reclaims storage.
 *
 * Guarantees:
 * - Single runner: CleanupJob.lockKey is UNIQUE and held only while RUNNING, so two
 *   concurrent triggers cannot both run (enforced by Postgres, not by a racy read).
 * - Retried triggers are deduplicated: the same idempotencyKey maps to one CleanupJob.
 * - Idempotent steps: status flips use conditional updateMany, deletes use deleteMany,
 *   and storage deletes treat "already gone" as success, so re-running is always safe.
 * - Failure safety: a File row is deleted only after its object AND derived objects
 *   are gone. On failure the row stays, with attempt count, error and a backoff time,
 *   and the folder stays blocked (EXPIRED/DELETED) until a later run succeeds.
 */

const LOCK_KEY = "GLOBAL";
const STALE_LOCK_MS = 15 * 60 * 1000;
// A run stops picking up new work after this long, so it always finishes well before its
// lock could be considered stale and taken over by a second runner. Leftovers go to the next run.
const RUN_TIME_BUDGET_MS = 5 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const MAX_ERROR_DETAILS = 20;

export interface CleanupOptions {
  jobType?: string;
  /** userId of the admin who triggered it, or a label such as "cron" */
  triggeredBy?: string | null;
  /** Same key => same CleanupJob; a retried trigger never creates a duplicate run */
  idempotencyKey?: string | null;
  /** Override the expiration clock (defaults to getServerNow(), which honours the dev test clock) */
  now?: Date;
  batchSize?: number;
  /** Stop starting new purge work after this many ms (default 5 min, below the 15 min stale-lock window) */
  timeBudgetMs?: number;
  storage?: StorageService;
  prisma?: PrismaClient;
  notifier?: NotificationProvider;
}

export interface CleanupResult {
  jobId: string;
  status: CleanupJobStatus;
  success: boolean;
  /** Another run holds the lock; nothing was done */
  skipped: boolean;
  /** idempotencyKey matched an already-finished job; its recorded result is returned */
  replayed: boolean;
  foldersExpired: number;
  foldersMarkedDeleted: number;
  foldersPurged: number;
  filesPurged: number;
  bytesReclaimed: bigint;
  failedDeletions: number;
  sessionsPurged: number;
  tokensPurged: number;
  warningsSent: number;
  durationMs: number;
  errors: string[];
}

interface Counters {
  foldersExpired: number;
  foldersMarkedDeleted: number;
  foldersPurged: number;
  filesPurged: number;
  bytesReclaimed: bigint;
  failedDeletions: number;
  sessionsPurged: number;
  tokensPurged: number;
  warningsSent: number;
  errors: string[];
}

function emptyCounters(): Counters {
  return {
    foldersExpired: 0,
    foldersMarkedDeleted: 0,
    foldersPurged: 0,
    filesPurged: 0,
    bytesReclaimed: BigInt(0),
    failedDeletions: 0,
    sessionsPurged: 0,
    tokensPurged: 0,
    warningsSent: 0,
    errors: [],
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Exponential backoff for failed storage deletions: 2, 4, 8 ... minutes, capped at 6 hours. */
export function purgeBackoffMs(attempts: number): number {
  return Math.min(2 ** Math.max(1, attempts) * 60 * 1000, 6 * 60 * 60 * 1000);
}

function resultFromJob(job: CleanupJob, flags: { skipped?: boolean; replayed?: boolean }): CleanupResult {
  let meta: Partial<Record<string, number>> & { errors?: string[] } = {};
  try {
    meta = job.metadata ? JSON.parse(job.metadata) : {};
  } catch {
    meta = {};
  }
  return {
    jobId: job.id,
    status: job.status,
    success: job.status === CleanupJobStatus.COMPLETED || job.status === CleanupJobStatus.PARTIAL || !!flags.skipped,
    skipped: !!flags.skipped,
    replayed: !!flags.replayed,
    foldersExpired: job.foldersExpired,
    foldersMarkedDeleted: meta.foldersMarkedDeleted ?? 0,
    foldersPurged: job.foldersPurged,
    filesPurged: job.filesPurged,
    bytesReclaimed: job.bytesReclaimed,
    failedDeletions: job.failedDeletions,
    sessionsPurged: meta.sessionsPurged ?? 0,
    tokensPurged: meta.tokensPurged ?? 0,
    warningsSent: meta.warningsSent ?? 0,
    durationMs: meta.durationMs ?? 0,
    errors: meta.errors ?? (job.errorMessage ? [job.errorMessage] : []),
  };
}

// ─── Lock / idempotency ──────────────────────────────────────────────────────

type Acquired = { kind: "acquired"; job: CleanupJob } | { kind: "done"; result: CleanupResult };

async function releaseStaleLock(prisma: PrismaClient): Promise<boolean> {
  const released = await prisma.cleanupJob.updateMany({
    where: { lockKey: LOCK_KEY, startedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) } },
    data: {
      lockKey: null,
      status: CleanupJobStatus.FAILED,
      errorMessage: "Lock expired: worker stopped before completing",
      completedAt: new Date(),
    },
  });
  return released.count > 0;
}

async function acquireJob(prisma: PrismaClient, opts: CleanupOptions, allowStaleRetry = true): Promise<Acquired> {
  const jobType = opts.jobType ?? "EXPIRED_LIFECYCLE_CLEANUP";
  const idempotencyKey = opts.idempotencyKey || null;
  const startedAt = new Date();

  try {
    if (idempotencyKey) {
      const existing = await prisma.cleanupJob.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.status === CleanupJobStatus.RUNNING) {
          return { kind: "done", result: resultFromJob(existing, { skipped: true }) };
        }
        if (existing.status !== CleanupJobStatus.FAILED) {
          return { kind: "done", result: resultFromJob(existing, { replayed: true }) };
        }
        // A fatally FAILED job with this key is re-run on the same record (no duplicate row)
        const job = await prisma.cleanupJob.update({
          where: { id: existing.id },
          data: {
            lockKey: LOCK_KEY,
            status: CleanupJobStatus.RUNNING,
            attempts: { increment: 1 },
            startedAt,
            completedAt: null,
            errorMessage: null,
          },
        });
        return { kind: "acquired", job };
      }
    }

    // Cheap pre-check to avoid a logged constraint error in the common "already running" case;
    // correctness still comes from the unique lockKey insert below.
    const holder = await prisma.cleanupJob.findUnique({ where: { lockKey: LOCK_KEY } });
    if (holder && holder.startedAt && holder.startedAt.getTime() > Date.now() - STALE_LOCK_MS) {
      return { kind: "done", result: resultFromJob(holder, { skipped: true }) };
    }

    const job = await prisma.cleanupJob.create({
      data: {
        jobType,
        status: CleanupJobStatus.RUNNING,
        lockKey: LOCK_KEY,
        idempotencyKey,
        triggeredBy: opts.triggeredBy ?? null,
        startedAt,
      },
    });
    return { kind: "acquired", job };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    // Either the same idempotencyKey was inserted concurrently, or another run holds the lock
    if (idempotencyKey) {
      const existing = await prisma.cleanupJob.findUnique({ where: { idempotencyKey } });
      if (existing && existing.lockKey !== LOCK_KEY && existing.status !== CleanupJobStatus.FAILED) {
        return { kind: "done", result: resultFromJob(existing, { replayed: true }) };
      }
    }
    if (allowStaleRetry && (await releaseStaleLock(prisma))) {
      return acquireJob(prisma, opts, false);
    }
    const holder = await prisma.cleanupJob.findUnique({ where: { lockKey: LOCK_KEY } });
    if (holder) return { kind: "done", result: resultFromJob(holder, { skipped: true }) };
    // Lock was released between our insert and lookup — one more attempt
    if (allowStaleRetry) return acquireJob(prisma, opts, false);
    throw err;
  }
}

// ─── Storage purge ───────────────────────────────────────────────────────────

/**
 * Deletes the object and its thumbnails/previews. Every delete is attempted; if any
 * fails the whole file counts as failed so the row (our only pointer to the
 * objects) is kept for retry.
 */
async function purgeFileObjects(storage: StorageService, file: Pick<File, "storageKey">): Promise<string | null> {
  const keys = [file.storageKey, ...getDerivedStorageKeys(file.storageKey)];
  const failures: string[] = [];
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (err) {
      failures.push(`${key}: ${errorMessage(err)}`);
    }
  }
  return failures.length > 0 ? failures.join("; ") : null;
}

async function purgeFile(
  prisma: PrismaClient,
  storage: StorageService,
  file: File,
  now: Date,
  c: Counters
): Promise<boolean> {
  const failure = await purgeFileObjects(storage, file);

  if (failure === null) {
    // deleteMany: a concurrent/previous run may already have removed the row
    await prisma.file.deleteMany({ where: { id: file.id } });
    c.filesPurged++;
    c.bytesReclaimed += file.fileSize;
    return true;
  }

  const attempts = file.purgeAttempts + 1;
  await prisma.file.updateMany({
    where: { id: file.id },
    data: {
      deletedAt: file.deletedAt ?? now,
      purgeAttempts: attempts,
      lastPurgeError: failure.slice(0, 1000),
      nextPurgeAttemptAt: new Date(now.getTime() + purgeBackoffMs(attempts)),
    },
  });
  c.failedDeletions++;
  c.errors.push(`file ${file.id} (attempt ${attempts}): ${failure}`);
  return false;
}

// ─── Phases ──────────────────────────────────────────────────────────────────

async function markLifecycle(prisma: PrismaClient, now: Date, c: Counters) {
  // Conditional updates: only ACTIVE rows flip, so repeated runs are no-ops
  const expired = await prisma.folder.updateMany({
    where: { status: FolderStatus.ACTIVE, deletedAt: null, expiresAt: { lte: now } },
    data: { status: FolderStatus.EXPIRED, expiredAt: now },
  });
  const deleted = await prisma.folder.updateMany({
    where: { status: FolderStatus.ACTIVE, deletedAt: { not: null } },
    data: { status: FolderStatus.DELETED },
  });
  c.foldersExpired = expired.count;
  c.foldersMarkedDeleted = deleted.count;
}

async function purgeFolders(
  prisma: PrismaClient,
  storage: StorageService,
  now: Date,
  batchSize: number,
  c: Counters,
  outOfTime: () => boolean
) {
  const folders = await prisma.folder.findMany({
    where: {
      status: { in: [FolderStatus.EXPIRED, FolderStatus.DELETED] },
      OR: [{ nextPurgeAttemptAt: null }, { nextPurgeAttemptAt: { lte: now } }],
    },
    orderBy: { expiresAt: "asc" },
    take: batchSize,
    select: { id: true, folderCode: true, userId: true, status: true, purgeAttempts: true, expiresAt: true },
  });

  for (const folder of folders) {
    if (outOfTime()) {
      c.errors.push("time budget reached; remaining folders deferred to the next run");
      break;
    }
    try {
      const files = await prisma.file.findMany({ where: { folderId: folder.id } });
      let failed = 0;
      for (const file of files) {
        if (!(await purgeFile(prisma, storage, file, now, c))) failed++;
      }

      if (failed === 0) {
        // Guard: only delete if no file rows remain (e.g. an upload that raced the purge;
        // the folder stays EXPIRED/DELETED and the next run purges the newcomer)
        const removed = await prisma.folder.deleteMany({ where: { id: folder.id, files: { none: {} } } });
        if (removed.count > 0) {
          c.foldersPurged++;
          // The row is gone, so the folder is identified through metadata
          await prisma.auditLog
            .create({
              data: {
                userId: folder.userId,
                action: folder.status === FolderStatus.EXPIRED ? "FOLDER_EXPIRED_PURGED" : "FOLDER_DELETED_PURGED",
                metadata: JSON.stringify({
                  folderId: folder.id,
                  folderCode: folder.folderCode,
                  expiresAt: folder.expiresAt.toISOString(),
                  filesPurged: files.length,
                }),
              },
            })
            .catch(() => null);
        }
      } else {
        const attempts = folder.purgeAttempts + 1;
        await prisma.folder.updateMany({
          where: { id: folder.id },
          data: {
            purgeAttempts: attempts,
            lastPurgeError: `${failed} of ${files.length} file(s) failed storage deletion`,
            nextPurgeAttemptAt: new Date(now.getTime() + purgeBackoffMs(attempts)),
          },
        });
      }
    } catch (err) {
      c.errors.push(`folder ${folder.folderCode}: ${errorMessage(err)}`);
    }
  }
}

/** Files individually deleted from still-active folders whose storage delete failed or is pending. */
async function purgeOrphanFiles(
  prisma: PrismaClient,
  storage: StorageService,
  now: Date,
  batchSize: number,
  c: Counters,
  outOfTime: () => boolean
) {
  const files = await prisma.file.findMany({
    where: {
      deletedAt: { not: null },
      folder: { status: FolderStatus.ACTIVE },
      OR: [{ nextPurgeAttemptAt: null }, { nextPurgeAttemptAt: { lte: now } }],
    },
    take: batchSize,
  });
  for (const file of files) {
    if (outOfTime()) break;
    try {
      await purgeFile(prisma, storage, file, now, c);
    } catch (err) {
      c.errors.push(`file ${file.id}: ${errorMessage(err)}`);
    }
  }
}

async function purgeExpiredTokens(prisma: PrismaClient, now: Date, c: Counters) {
  const [tokens, sessions] = await Promise.all([
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { not: null } }] },
    }),
    prisma.uploadSession.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);
  c.tokensPurged = tokens.count;
  c.sessionsPurged = sessions.count;
}

/**
 * Registered-user expiry warnings. At most one per folder lifetime: the folder is
 * claimed by setting expiryWarningSentAt *before* sending, and released if sending
 * fails so the next run retries.
 */
export async function sendExpirationWarnings(
  opts: { now?: Date; policy?: RetentionPolicy; prisma?: PrismaClient; notifier?: NotificationProvider } = {}
): Promise<number> {
  const prisma = opts.prisma ?? defaultPrisma;
  const now = opts.now ?? (await getServerNow(prisma));
  const policy = opts.policy ?? (await getRetentionPolicy(prisma));
  if (!policy.expiryWarningEmails) return 0;
  const notifier = opts.notifier ?? getNotificationProvider();

  const folders = await prisma.folder.findMany({
    where: {
      status: FolderStatus.ACTIVE,
      deletedAt: null,
      userId: { not: null },
      expiryWarningSentAt: null,
      expiresAt: { gt: now, lte: new Date(now.getTime() + policy.userExpiringSoonMs) },
      // Filtered in the query (not in JS) so inactive accounts can't fill the batch forever
      user: { isActive: true },
    },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { expiresAt: "asc" }, // most urgent first
    take: 100,
  });

  let sent = 0;
  for (const folder of folders) {
    if (!folder.user) continue;

    const claimed = await prisma.folder.updateMany({
      where: { id: folder.id, expiryWarningSentAt: null },
      data: { expiryWarningSentAt: now },
    });
    if (claimed.count === 0) continue;

    const remainingMs = folder.expiresAt.getTime() - now.getTime();
    try {
      await notifier.sendExpiryWarning({
        to: folder.user.email,
        recipientName: folder.user.name,
        folderCode: folder.folderCode,
        folderName: folder.folderName,
        expiresAt: folder.expiresAt,
        remainingMs,
        folderUrl: getFolderShareUrl(folder.folderCode),
      });
      sent++;
      await prisma.auditLog
        .create({
          data: {
            userId: folder.user.id,
            folderId: folder.id,
            action: "EXPIRATION_WARNING_SENT",
            metadata: JSON.stringify({
              provider: notifier.name,
              folderCode: folder.folderCode,
              expiresAt: folder.expiresAt.toISOString(),
              remainingHours: Math.round(remainingMs / 3600000),
            }),
          },
        })
        .catch(() => null);
    } catch (err) {
      await prisma.folder.updateMany({
        where: { id: folder.id },
        data: { expiryWarningSentAt: null },
      });
      console.warn(`[cleanup] expiry warning for ${folder.folderCode} failed: ${errorMessage(err)}`);
    }
  }
  return sent;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runCleanupJob(opts: CleanupOptions = {}): Promise<CleanupResult> {
  const prisma = opts.prisma ?? defaultPrisma;
  const storage = opts.storage ?? defaultStorage;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;

  const acquired = await acquireJob(prisma, opts);
  if (acquired.kind === "done") return acquired.result;

  const job = acquired.job;
  const started = Date.now();
  const c = emptyCounters();
  let fatal: string | null = null;

  try {
    const now = opts.now ?? (await getServerNow(prisma));
    const policy = await getRetentionPolicy(prisma);

    await markLifecycle(prisma, now, c);
    const outOfTime = () => Date.now() - started > (opts.timeBudgetMs ?? RUN_TIME_BUDGET_MS);
    await purgeFolders(prisma, storage, now, batchSize, c, outOfTime);
    await purgeOrphanFiles(prisma, storage, now, batchSize, c, outOfTime);
    await purgeExpiredTokens(prisma, now, c);
    c.warningsSent = await sendExpirationWarnings({ now, policy, prisma, notifier: opts.notifier });
  } catch (err) {
    fatal = errorMessage(err);
    c.errors.push(`fatal: ${fatal}`);
  }

  const durationMs = Date.now() - started;
  const status = fatal
    ? CleanupJobStatus.FAILED
    : c.errors.length > 0
      ? CleanupJobStatus.PARTIAL
      : CleanupJobStatus.COMPLETED;

  const summary = {
    foldersMarkedDeleted: c.foldersMarkedDeleted,
    sessionsPurged: c.sessionsPurged,
    tokensPurged: c.tokensPurged,
    warningsSent: c.warningsSent,
    durationMs,
    errors: c.errors.slice(0, MAX_ERROR_DETAILS),
  };

  // Always release the lock, even after a fatal error or if recording the metrics fails
  const finished = await prisma.cleanupJob.update({
    where: { id: job.id },
    data: {
      status,
      lockKey: null,
      completedAt: new Date(),
      foldersExpired: c.foldersExpired,
      foldersPurged: c.foldersPurged,
      filesPurged: c.filesPurged,
      failedDeletions: c.failedDeletions,
      bytesReclaimed: c.bytesReclaimed,
      itemsProcessed: c.foldersPurged + c.filesPurged + c.sessionsPurged + c.tokensPurged,
      errorMessage: fatal ?? (c.errors.length > 0 ? `${c.errors.length} error(s); first: ${c.errors[0]}` : null),
      metadata: JSON.stringify(summary),
    },
  }).catch(async (err) => {
    // Minimal write so the lock is not held until it goes stale
    await prisma.cleanupJob
      .updateMany({
        where: { id: job.id },
        data: { lockKey: null, status: CleanupJobStatus.FAILED, completedAt: new Date(), errorMessage: `finalize failed: ${errorMessage(err)}` },
      })
      .catch(() => null);
    throw err;
  });

  const logLine = {
    jobId: job.id,
    jobType: job.jobType,
    status,
    foldersExpired: c.foldersExpired,
    foldersPurged: c.foldersPurged,
    filesPurged: c.filesPurged,
    failedDeletions: c.failedDeletions,
    bytesReclaimed: c.bytesReclaimed.toString(),
    durationMs,
  };
  (status === CleanupJobStatus.COMPLETED ? console.info : console.warn)("[cleanup]", JSON.stringify(logLine));

  const triggeredBy = opts.triggeredBy ?? null;
  const triggeredByUser =
    triggeredBy && (await prisma.user.findUnique({ where: { id: triggeredBy }, select: { id: true } }).catch(() => null));

  await prisma.auditLog
    .create({
      data: {
        userId: triggeredByUser ? triggeredByUser.id : null,
        action: status === CleanupJobStatus.FAILED ? "CLEANUP_JOB_FAILED" : "CLEANUP_JOB_COMPLETED",
        metadata: JSON.stringify({ ...logLine, triggeredBy, errors: summary.errors.slice(0, 5) }),
      },
    })
    .catch(() => null);

  return { ...resultFromJob(finished, {}), durationMs, errors: c.errors };
}

/** JSON-safe view of a result (BigInt -> string) for API responses. */
export function serializeCleanupResult(result: CleanupResult) {
  return {
    ...result,
    bytesReclaimed: result.bytesReclaimed.toString(),
    // Aliases kept for the existing admin UI
    foldersProcessed: result.foldersPurged,
    filesProcessed: result.filesPurged,
    error: result.errors[0],
  };
}
