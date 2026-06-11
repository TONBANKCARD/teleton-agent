/**
 * Sliding window rate limiter for plugin bot actions.
 * In-memory, per-plugin, no external dependencies.
 */

type RateLimitUserId = number | string;

interface RateLimitWindow {
  timestamps: number[];
  windowMs: number;
}

export class PluginRateLimiter {
  private windows = new Map<string, RateLimitWindow>();

  /**
   * Check if an action is allowed under the rate limit.
   * Throws if the limit is exceeded.
   *
   * @param pluginName - Plugin identifier
   * @param action - Action type (e.g. "inline", "callback")
   * @param limit - Max actions per window
   * @param windowMs - Window duration in ms (default: 60000)
   * @param userId - Requesting Telegram user id; omitted callers share a global bucket
   */
  check(
    pluginName: string,
    action: string,
    limit: number,
    windowMs = 60_000,
    userId?: RateLimitUserId
  ): void {
    const key = this.keyFor(pluginName, action, userId);
    const now = Date.now();

    this.pruneExpiredWindows(now, key);

    let bucket = this.windows.get(key);
    if (!bucket) {
      bucket = { timestamps: [], windowMs };
      this.windows.set(key, bucket);
    } else {
      bucket.windowMs = windowMs;
      this.pruneWindow(bucket, now);
    }

    if (bucket.timestamps.length >= limit) {
      const userScope = userId === undefined ? "" : ` user "${userId}"`;
      throw new Error(
        `Rate limit exceeded for plugin "${pluginName}" action "${action}"${userScope}: ${limit} per ${
          windowMs / 1000
        }s`
      );
    }

    bucket.timestamps.push(now);
  }

  private keyFor(pluginName: string, action: string, userId: RateLimitUserId | undefined): string {
    return `${pluginName}:${action}:${userId ?? "global"}`;
  }

  private pruneExpiredWindows(now: number, skipKey: string): void {
    for (const [key, bucket] of this.windows) {
      if (key === skipKey) continue;

      this.pruneWindow(bucket, now);
      if (bucket.timestamps.length === 0) {
        this.windows.delete(key);
      }
    }
  }

  private pruneWindow(bucket: RateLimitWindow, now: number): void {
    const cutoff = now - bucket.windowMs;
    const { timestamps } = bucket;
    const firstValid = timestamps.findIndex((t) => t > cutoff);
    if (firstValid > 0) {
      timestamps.splice(0, firstValid);
    } else if (firstValid === -1) {
      timestamps.length = 0;
    }
  }

  /** Clear all rate limit windows (for testing) */
  clear(): void {
    this.windows.clear();
  }
}
