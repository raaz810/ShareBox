import { Folder, PrismaClient } from "@prisma/client";
import defaultPrisma from "@/lib/prisma";
import {
  computeExpirationStatus,
  ExpirationStatus,
  formatRemaining,
} from "@/lib/expiration-state";

export * from "@/lib/expiration-state";

export const FolderStatus = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  DELETED: "DELETED",
} as const;
export type FolderStatus = (typeof FolderStatus)[keyof typeof FolderStatus];

/**
 * Server-side expiration authority (Part 7).
 *
 * - All timestamps are absolute UTC instants (Postgres TIMESTAMP(3) via Prisma Date).
 * - expiresAt = createdAt + retention (guest: 24h, registered: 15d by default).
 * - Access is denied as soon as expiresAt <= server "now", independent of cleanup.
 * - "now" comes from getServerNow(), which supports a dev-only test clock offset.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_RETENTION_MS = 60 * 1000; // never allow a retention shorter than 1 minute
const MAX_RETENTION_MS = 365 * DAY_MS;

export const SETTING_KEYS = {
  guestRetentionHours: "guest_folder_lifespan_hours",
  userRetentionDays: "user_folder_lifespan_days",
  guestExpiringSoonHours: "guest_expiring_soon_hours",
  userExpiringSoonHours: "user_expiring_soon_hours",
  expiryWarningEmails: "expiry_warning_emails_enabled",
  testClockOffsetSeconds: "dev_clock_offset_seconds",
} as const;

export const RETENTION_DEFAULTS = {
  guestHours: 24,
  userDays: 15,
  guestExpiringSoonHours: 2,
  userExpiringSoonHours: 24,
};

export interface RetentionPolicy {
  guestRetentionMs: number;
  userRetentionMs: number;
  guestExpiringSoonMs: number;
  userExpiringSoonMs: number;
  expiryWarningEmails: boolean;
}

// ─── Test clock ──────────────────────────────────────────────────────────────

/**
 * The test clock is never honoured in production unless explicitly opted in
 * (e.g. a staging environment running with NODE_ENV=production).
 */
export function isTestClockAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_CLOCK === "true";
}

let offsetCache: { value: number; readAt: number } | null = null;
const OFFSET_CACHE_TTL_MS = 1000;

export async function getTestClockOffsetMs(prisma: PrismaClient = defaultPrisma): Promise<number> {
  if (!isTestClockAllowed()) return 0;

  const envOffset = Number(process.env.DEV_CLOCK_OFFSET_SECONDS || 0);
  if (Number.isFinite(envOffset) && envOffset !== 0) return envOffset * 1000;

  if (offsetCache && Date.now() - offsetCache.readAt < OFFSET_CACHE_TTL_MS) {
    return offsetCache.value;
  }

  let value = 0;
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEYS.testClockOffsetSeconds },
    });
    const parsed = Number(setting?.value ?? 0);
    value = Number.isFinite(parsed) ? parsed * 1000 : 0;
  } catch {
    value = 0;
  }
  offsetCache = { value, readAt: Date.now() };
  return value;
}

export async function setTestClockOffsetSeconds(
  seconds: number,
  prisma: PrismaClient = defaultPrisma
): Promise<void> {
  if (!isTestClockAllowed()) {
    throw new Error("Test clock is disabled in production");
  }
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEYS.testClockOffsetSeconds },
    update: { value: String(Math.trunc(seconds)) },
    create: {
      key: SETTING_KEYS.testClockOffsetSeconds,
      value: String(Math.trunc(seconds)),
      description: "DEV ONLY: shifts the server expiration clock forward (seconds). Ignored in production.",
      isPublic: false,
    },
  });
  offsetCache = null;
}

/**
 * The single source of "now" for every expiration decision.
 */
export async function getServerNow(prisma: PrismaClient = defaultPrisma): Promise<Date> {
  const offset = await getTestClockOffsetMs(prisma);
  return new Date(Date.now() + offset);
}

// ─── Retention policy ────────────────────────────────────────────────────────

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampRetention(ms: number): number {
  return Math.min(MAX_RETENTION_MS, Math.max(MIN_RETENTION_MS, ms));
}

/**
 * Reads retention from SystemSetting. Values may be fractional so that dev can use
 * e.g. guest_folder_lifespan_hours = 0.05 (3 minutes) to exercise expiry quickly.
 */
export async function getRetentionPolicy(prisma: PrismaClient = defaultPrisma): Promise<RetentionPolicy> {
  let map = new Map<string, string>();
  try {
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: Object.values(SETTING_KEYS) } },
    });
    map = new Map(settings.map((s) => [s.key, s.value]));
  } catch {
    // Fall through to defaults if settings table is unreachable
  }

  const guestHours = parsePositiveNumber(map.get(SETTING_KEYS.guestRetentionHours), RETENTION_DEFAULTS.guestHours);
  const userDays = parsePositiveNumber(map.get(SETTING_KEYS.userRetentionDays), RETENTION_DEFAULTS.userDays);
  const guestSoonHours = parsePositiveNumber(
    map.get(SETTING_KEYS.guestExpiringSoonHours),
    RETENTION_DEFAULTS.guestExpiringSoonHours
  );
  const userSoonHours = parsePositiveNumber(
    map.get(SETTING_KEYS.userExpiringSoonHours),
    RETENTION_DEFAULTS.userExpiringSoonHours
  );

  return {
    guestRetentionMs: clampRetention(guestHours * HOUR_MS),
    userRetentionMs: clampRetention(userDays * DAY_MS),
    guestExpiringSoonMs: guestSoonHours * HOUR_MS,
    userExpiringSoonMs: userSoonHours * HOUR_MS,
    expiryWarningEmails: map.get(SETTING_KEYS.expiryWarningEmails) !== "false",
  };
}

/**
 * expiresAt = createdAt + retention. `overrideSeconds` is a dev-only per-folder
 * lifespan used by the test tooling and is ignored when the test clock is disabled.
 */
export function computeExpiresAt(
  createdAt: Date,
  isRegistered: boolean,
  policy: RetentionPolicy,
  overrideSeconds?: number
): Date {
  if (overrideSeconds !== undefined && overrideSeconds > 0 && isTestClockAllowed()) {
    return new Date(createdAt.getTime() + overrideSeconds * 1000);
  }
  const envSeconds = Number(process.env.TEST_EXPIRATION_SECONDS || 0);
  if (envSeconds > 0 && isTestClockAllowed()) {
    return new Date(createdAt.getTime() + envSeconds * 1000);
  }
  const retention = isRegistered ? policy.userRetentionMs : policy.guestRetentionMs;
  return new Date(createdAt.getTime() + retention);
}

// ─── Access gate ─────────────────────────────────────────────────────────────

export interface LifecycleFields {
  status?: FolderStatus | string | null;
  deletedAt?: Date | null;
  expiresAt: Date;
  userId?: string | null;
}

export type FolderAccessResult =
  | { ok: true; now: Date; expiration: ExpirationStatus }
  | { ok: false; now: Date; status: 410; code: "EXPIRED" | "DELETED"; error: string };

/**
 * Every folder/file route calls this before doing anything else.
 * Denies when the folder is soft-deleted, marked expired by cleanup,
 * or expiresAt <= server now (even if cleanup has not run yet).
 */
export async function checkFolderAccess(
  folder: LifecycleFields,
  opts: { now?: Date; policy?: RetentionPolicy; prisma?: PrismaClient } = {}
): Promise<FolderAccessResult> {
  const now = opts.now ?? (await getServerNow(opts.prisma));

  if (folder.deletedAt || folder.status === FolderStatus.DELETED) {
    return { ok: false, now, status: 410, code: "DELETED", error: "This folder has been deleted by its owner." };
  }

  const policy = opts.policy ?? (await getRetentionPolicy(opts.prisma));
  const expiration = computeExpirationStatus(folder.expiresAt, now, !folder.userId, policy);

  if (folder.status === FolderStatus.EXPIRED || expiration.isExpired) {
    return {
      ok: false,
      now,
      status: 410,
      code: "EXPIRED",
      error: "This folder has reached its expiration time and is no longer accessible.",
    };
  }

  return { ok: true, now, expiration };
}

/**
 * Standard expiration payload for API responses. The client renders these values
 * and derives a clock-skew correction from `serverTime`; it never decides expiry.
 */
export function serializeExpiration(expiresAt: Date, now: Date, expiration: ExpirationStatus) {
  return {
    expiresAt: expiresAt.toISOString(),
    serverTime: now.toISOString(),
    remainingMs: expiration.remainingMs,
    expirationState: expiration.state,
    remainingTime: formatRemaining(expiration.remainingMs),
  };
}

/**
 * Signed URLs must never outlive the folder. Returns the TTL (seconds) to use,
 * capped at the folder's remaining lifetime; always at least 1 second.
 */
export function capSignedUrlTtl(requestedSeconds: number, remainingMs: number): number {
  return Math.max(1, Math.min(requestedSeconds, Math.floor(remainingMs / 1000)));
}
