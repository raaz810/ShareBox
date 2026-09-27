/**
 * Pure expiration-state helpers shared by server and client.
 * No Prisma / Node imports here — this file is safe to bundle into React components.
 *
 * The server is the only authority on expiry: the API returns `expirationState`,
 * `serverTime` and `remainingMs`, and the client uses them for display only.
 */

export type ExpirationState = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED";

export const EXPIRATION_STATE_LABELS: Record<ExpirationState, string> = {
  ACTIVE: "Active",
  EXPIRING_SOON: "Expiring Soon",
  EXPIRED: "Expired",
};

export interface ExpiringSoonThresholds {
  guestExpiringSoonMs: number;
  userExpiringSoonMs: number;
}

export const DEFAULT_EXPIRING_SOON: ExpiringSoonThresholds = {
  guestExpiringSoonMs: 2 * 60 * 60 * 1000, // 2 hours
  userExpiringSoonMs: 24 * 60 * 60 * 1000, // 24 hours
};

export interface ExpirationStatus {
  state: ExpirationState;
  isExpired: boolean;
  isExpiringSoon: boolean;
  remainingMs: number;
}

/**
 * Expired when expiresAt <= now (inclusive: the exact expiry instant is already expired).
 */
export function computeExpirationStatus(
  expiresAt: Date | string,
  now: Date,
  isGuest: boolean,
  thresholds: ExpiringSoonThresholds = DEFAULT_EXPIRING_SOON
): ExpirationStatus {
  const remainingMs = new Date(expiresAt).getTime() - now.getTime();

  if (remainingMs <= 0) {
    return { state: "EXPIRED", isExpired: true, isExpiringSoon: false, remainingMs: 0 };
  }

  const soonMs = isGuest ? thresholds.guestExpiringSoonMs : thresholds.userExpiringSoonMs;
  const isExpiringSoon = remainingMs <= soonMs;

  return {
    state: isExpiringSoon ? "EXPIRING_SOON" : "ACTIVE",
    isExpired: false,
    isExpiringSoon,
    remainingMs,
  };
}

export function formatRemaining(remainingMs: number, withSeconds = false): string {
  if (remainingMs <= 0) return "Expired";

  const seconds = Math.floor((remainingMs / 1000) % 60);
  const minutes = Math.floor((remainingMs / 60000) % 60);
  const hours = Math.floor((remainingMs / 3600000) % 24);
  const days = Math.floor(remainingMs / 86400000);

  if (withSeconds) {
    return days > 0 ? `${days}d ${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m ${seconds}s`;
  }
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}
