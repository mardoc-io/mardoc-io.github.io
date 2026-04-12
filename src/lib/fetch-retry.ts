/**
 * Exponential-backoff retry wrapper for transient GitHub API failures.
 *
 * Retries only when the error is classified as transient by
 * isTransientError — 5xx responses, 408 timeouts, and network-level
 * failures. Rate-limit errors are NOT retried here; the circuit breaker
 * in rate-limit.ts handles them by pausing all callers until the reset.
 *
 * Default: 3 attempts total (initial + 2 retries), with jittered
 * exponential backoff at ~500ms, ~1000ms. Short enough that a transient
 * GitHub blip heals before the user notices; short enough that a truly
 * broken endpoint gives up quickly.
 */

import { isTransientError } from "./rate-limit";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 4000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULTS, ...opts };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isTransientError(err)) throw err;
      const delay = computeBackoff(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export function computeBackoff(attempt: number, baseMs: number, maxMs: number): number {
  // Exponential: base * 2^(attempt-1), capped at maxMs, with ±25% jitter.
  const exp = baseMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exp, maxMs);
  const jitter = capped * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
