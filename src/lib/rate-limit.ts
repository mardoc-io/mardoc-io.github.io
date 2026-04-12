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

/**
 * Classify an error as transient (worth retrying) or permanent.
 * Transient: network errors, 5xx server errors, 408 timeout, 502/503/504.
 * Permanent: 4xx client errors (except 408), validation errors, auth.
 * Rate-limit errors are NOT classified as transient here — they're handled
 * by the circuit breaker instead (retrying would just waste requests).
 */
export function isTransientError(error: unknown): boolean {
  if (isRateLimitError(error)) return false;
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; code?: string; message?: string };

  // Network-level failures (no response at all)
  if (e.code === "ENOTFOUND" || e.code === "ECONNRESET" || e.code === "ETIMEDOUT") return true;
  if (typeof e.message === "string") {
    const msg = e.message.toLowerCase();
    if (msg.includes("network") || msg.includes("fetch failed") || msg.includes("timeout")) return true;
  }

  // HTTP 5xx and 408
  if (e.status === 408) return true;
  if (typeof e.status === "number" && e.status >= 500 && e.status < 600) return true;

  return false;
}

/**
 * Return true if the error is an authentication failure (401 Bad
 * credentials). The UI should prompt the user to re-enter their token.
 * A 403 is NOT an auth error by itself — it's usually a permission
 * problem or a rate limit.
 */
export function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { status?: number; message?: string };
  if (e.status === 401) return true;
  if (typeof e.message === "string" && /bad credentials/i.test(e.message)) return true;
  return false;
}

/**
 * Format an API error for display in the UI. Special-cases the most
 * common user-actionable failures with clear guidance; falls back to
 * a formatted version of the raw message for everything else.
 */
export function formatApiError(error: unknown, context: string): string {
  if (isAuthError(error)) {
    return `${context}: your GitHub token is invalid or expired. Open Settings to re-authenticate.`;
  }
  if (isRateLimitError(error)) {
    const info = getRateLimitInfo();
    if (info.resetsAt > 0) {
      const mins = Math.max(1, Math.ceil((info.resetsAt - Date.now()) / 60_000));
      return `${context}: GitHub rate limit reached. Resets in ~${mins} minute${mins > 1 ? "s" : ""}.`;
    }
    return `${context}: GitHub rate limit reached. Please wait a few minutes.`;
  }
  const e = error as { status?: number; message?: string } | null;
  if (e?.status === 404) {
    return `${context}: not found. The resource may have been deleted or you may not have access.`;
  }
  if (e?.status === 403) {
    return `${context}: access denied. Check that your token has the required permissions.`;
  }
  if (e?.message) {
    return `${context}: ${e.message}`;
  }
  return context;
}
