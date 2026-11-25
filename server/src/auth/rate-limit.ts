/**
 * Sliding-window rate limiter for login attempts.
 */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly maxAttempts: number = 10,
    private readonly windowMs: number = 15 * 60 * 1000,
  ) {}

  isBlocked(key: string, nowMs: number = Date.now()): boolean {
    const recent = this.pruneKey(key, nowMs);
    return recent.length >= this.maxAttempts;
  }

  recordFailure(key: string, nowMs: number = Date.now()): void {
    const recent = this.pruneKey(key, nowMs);
    recent.push(nowMs);
    this.attempts.set(key, recent);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private pruneKey(key: string, nowMs: number): number[] {
    const cutoff = nowMs - this.windowMs;
    const current = this.attempts.get(key) ?? [];
    const recent = current.filter((ts) => ts > cutoff);
    if (recent.length === 0) {
      this.attempts.delete(key);
    } else {
      this.attempts.set(key, recent);
    }
    return recent;
  }
}
