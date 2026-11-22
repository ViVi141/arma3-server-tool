/**
 * Sliding-window limiter for failed API authentication attempts.
 * Keys are client IPs; successful auth should call {@link clear}.
 */
export class AuthFailureLimiter {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxFailures = 20,
    private readonly windowMs = 60_000,
    private readonly maxTrackedIps = 10_000
  ) {}

  /** True when this IP has exceeded the failure budget in the current window. */
  shouldBlock(ip: string): boolean {
    this.pruneExpired(ip);
    const entry = this.hits.get(ip);
    return Boolean(entry && entry.count >= this.maxFailures);
  }

  recordFailure(ip: string): void {
    const now = Date.now();
    const entry = this.hits.get(ip);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.evictIfNeeded();
      this.hits.set(ip, { count: 1, windowStart: now });
      return;
    }
    entry.count += 1;
  }

  clear(ip: string): void {
    this.hits.delete(ip);
  }

  /** Test helper. */
  size(): number {
    return this.hits.size;
  }

  private pruneExpired(ip: string): void {
    const entry = this.hits.get(ip);
    if (!entry) {
      return;
    }
    if (Date.now() - entry.windowStart >= this.windowMs) {
      this.hits.delete(ip);
    }
  }

  private evictIfNeeded(): void {
    if (this.hits.size < this.maxTrackedIps) {
      return;
    }
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) {
        this.hits.delete(key);
      }
    }
    if (this.hits.size < this.maxTrackedIps) {
      return;
    }
    // Drop arbitrary oldest-inserted key to bound memory under flood.
    const first = this.hits.keys().next().value;
    if (first !== undefined) {
      this.hits.delete(first);
    }
  }
}
