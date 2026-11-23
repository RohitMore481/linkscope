interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class RateLimiterService {
  private static userLimits = new Map<string, RateLimitRecord>();
  private static ipLimits = new Map<string, RateLimitRecord>();
  private static activeAnalyses = new Set<string>();

  // Cleanup old entries every 5 minutes
  static {
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.userLimits.entries()) {
        if (now > record.resetAt) this.userLimits.delete(key);
      }
      for (const [key, record] of this.ipLimits.entries()) {
        if (now > record.resetAt) this.ipLimits.delete(key);
      }
    }, 5 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  /**
   * Checks if an IP has exceeded rate limit (e.g. 60 requests / 10 minutes)
   */
  public static checkIpLimit(ip: string, maxRequests = 60, windowMs = 10 * 60 * 1000): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const record = this.ipLimits.get(ip);

    if (!record || now > record.resetAt) {
      this.ipLimits.set(ip, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    record.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /**
   * Checks if an authenticated user has exceeded rate limit (e.g. 20 requests / 15 minutes)
   */
  public static checkUserLimit(userId: string, maxRequests = 20, windowMs = 15 * 60 * 1000): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const record = this.userLimits.get(userId);

    if (!record || now > record.resetAt) {
      this.userLimits.set(userId, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    record.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /**
   * Acquires a concurrency lock for a user.
   * Returns false if an analysis is already in progress for this user.
   */
  public static acquireConcurrencyLock(userId: string): boolean {
    if (this.activeAnalyses.has(userId)) {
      return false;
    }
    this.activeAnalyses.add(userId);
    return true;
  }

  /**
   * Releases the concurrency lock for a user.
   */
  public static releaseConcurrencyLock(userId: string): void {
    this.activeAnalyses.delete(userId);
  }

  /**
   * Resets all limits (useful for testing)
   */
  public static resetAll(): void {
    this.userLimits.clear();
    this.ipLimits.clear();
    this.activeAnalyses.clear();
  }
}
