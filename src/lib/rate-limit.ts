/**
 * Rate-limit circuit breaker for GitHub API calls.
 *
 * The GitHub REST API returns a 403 with "rate limit exceeded" when
 * the token's hourly quota is spent (5,000 for authenticated users).
 * Responses also include `x-ratelimit-remaining` and
 * `x-ratelimit-reset` headers so callers can proactively avoid
 * wasting requests.
 *
 * This module tracks the rate-limit state globally. When a 403/429
 * is detected (either from the error or from the headers), it sets
 * a `pausedUntil` timestamp and every caller that checks
 * `isRateLimited()` before firing will skip the request. The 30s
 * comment poll in PRDetail.tsx and the propagation hedge are the
 * main consumers — they were burning 4+ requests per minute into
 * the limit with no backoff.
 */

let pausedUntil = 0;
let remaining: number | null = null;
let limit: number | null = null;

export function markRateLimited(resetEpochSec?: number) {
  if (resetEpochSec && resetEpochSec > 0) {
    pausedUntil = resetEpochSec * 1000;
  } else {
    pausedUntil = Date.now() + 60_000;
  }
}

export function isRateLimited(): boolean {
  if (Date.now() < pausedUntil) return true;
  if (pausedUntil > 0 && Date.now() >= pausedUntil) {
    pausedUntil = 0;
    remaining = null;
  }
  return false;
}

export function rateLimitResetsAt(): number {
  return pausedUntil;
}

export function clearRateLimit() {
  pausedUntil = 0;
  remaining = null;
  limit = null;
}

export function getRateLimitInfo(): {
  remaining: number | null;
  limit: number | null;
  resetsAt: number;
  isLimited: boolean;
} {
  return {
    remaining,
    limit,
    resetsAt: pausedUntil,
    isLimited: isRateLimited(),
  };
}

/**
 * Called after every successful Octokit response to track the
 * remaining quota. When remaining hits 0, proactively pauses
 * before the server starts returning 403s — this is the "soft
 * circuit breaker" that keeps the poll from wasting the last
 * few requests.
 */
export function updateFromHeaders(headers: Record<string, string | undefined>) {
  const rem = headers["x-ratelimit-remaining"];
  const lim = headers["x-ratelimit-limit"];
  const reset = headers["x-ratelimit-reset"];

  if (rem !== undefined) remaining = parseInt(rem, 10);
  if (lim !== undefined) limit = parseInt(lim, 10);

  if (remaining !== null && remaining <= 0 && reset) {
    markRateLimited(parseInt(reset, 10));
  }
}

export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; message?: string; response?: { headers?: Record<string, string> } };
  if (e.status === 429) return true;
  if (e.status === 403 && typeof e.message === "string" && e.message.toLowerCase().includes("rate limit")) return true;
  return false;
}

/**
 * Extract the reset timestamp from a rate-limit error response.
 * Returns undefined if the error doesn't include one.
 */
export function extractResetFromError(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { response?: { headers?: Record<string, string> } };
  const reset = e.response?.headers?.["x-ratelimit-reset"];
  if (reset) return parseInt(reset, 10);
  return undefined;
}
