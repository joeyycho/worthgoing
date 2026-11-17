/**
 * Simple fixed-window rate limiter (in-memory, per process).
 */
export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
  ) {}

  tryConsume(key: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    const current = this.hits.get(key);
    if (!current || now - current.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (current.count >= this.limit) {
      return {
        allowed: false,
        retryAfterMs: this.windowMs - (now - current.windowStart),
      };
    }
    current.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}
