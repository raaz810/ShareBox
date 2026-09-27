interface RateLimitRecord {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

class RateLimiter {
  private store = new Map<string, RateLimitRecord>();
  private windowMs: number;
  private maxAttempts: number;

  constructor(windowMs = 15 * 60 * 1000, maxAttempts = 5) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;

    // Periodic cleanup of expired entries every 5 minutes
    if (typeof setInterval !== "undefined") {
      const timer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
      if (timer && typeof timer === "object" && "unref" in timer) {
        (timer as { unref: () => void }).unref();
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    this.store.forEach((record, key) => {
      if (record.resetAt <= now) {
        this.store.delete(key);
      }
    });
  }

  public check(key: string): {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
  } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || record.resetAt <= now) {
      return {
        allowed: true,
        remaining: this.maxAttempts,
        retryAfterSeconds: 0,
      };
    }

    const remaining = Math.max(0, this.maxAttempts - record.count);
    const retryAfterSeconds = Math.max(0, Math.ceil((record.resetAt - now) / 1000));

    return {
      allowed: record.count < this.maxAttempts,
      remaining,
      retryAfterSeconds,
    };
  }

  public recordFailure(key: string): {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
  } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || record.resetAt <= now) {
      this.store.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return {
        allowed: true,
        remaining: this.maxAttempts - 1,
        retryAfterSeconds: Math.ceil(this.windowMs / 1000),
      };
    }

    record.count += 1;
    const remaining = Math.max(0, this.maxAttempts - record.count);
    const retryAfterSeconds = Math.max(0, Math.ceil((record.resetAt - now) / 1000));

    return {
      allowed: record.count <= this.maxAttempts,
      remaining,
      retryAfterSeconds,
    };
  }

  public clear(key: string): void {
    this.store.delete(key);
  }
}

// Global singletons for authentication rate limiting
export const loginRateLimiter = new RateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
export const resetPasswordRateLimiter = new RateLimiter(60 * 60 * 1000, 3); // 3 attempts per hour

/**
 * Extracts client IP from Next.js request headers.
 */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}
