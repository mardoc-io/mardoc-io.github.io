import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  markRateLimited,
  isRateLimited,
  clearRateLimit,
  updateFromHeaders,
  isRateLimitError,
  extractResetFromError,
  getRateLimitInfo,
  isTransientError,
  isAuthError,
  formatApiError,
} from "@/lib/rate-limit";

beforeEach(() => {
  clearRateLimit();
});

describe("rate-limit circuit breaker", () => {
  it("is not rate-limited by default", () => {
    expect(isRateLimited()).toBe(false);
  });

  it("pauses for 60s when markRateLimited is called without a reset timestamp", () => {
    markRateLimited();
    expect(isRateLimited()).toBe(true);
  });

  it("pauses until a specific epoch when markRateLimited is given a reset timestamp", () => {
    const futureEpochSec = Math.floor(Date.now() / 1000) + 3600;
    markRateLimited(futureEpochSec);
    expect(isRateLimited()).toBe(true);
    expect(getRateLimitInfo().resetsAt).toBe(futureEpochSec * 1000);
  });

  it("unpauses after the reset time passes", () => {
    const pastEpochSec = Math.floor(Date.now() / 1000) - 10;
    markRateLimited(pastEpochSec);
    expect(isRateLimited()).toBe(false);
  });

  it("clearRateLimit resets everything", () => {
    markRateLimited();
    expect(isRateLimited()).toBe(true);
    clearRateLimit();
    expect(isRateLimited()).toBe(false);
    expect(getRateLimitInfo().remaining).toBeNull();
  });
});

describe("updateFromHeaders", () => {
  it("tracks remaining and limit from response headers", () => {
    updateFromHeaders({
      "x-ratelimit-remaining": "4999",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-reset": "9999999999",
    });
    const info = getRateLimitInfo();
    expect(info.remaining).toBe(4999);
    expect(info.limit).toBe(5000);
    expect(info.isLimited).toBe(false);
  });

  it("triggers the circuit breaker when remaining hits 0", () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
    updateFromHeaders({
      "x-ratelimit-remaining": "0",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-reset": String(resetEpoch),
    });
    expect(isRateLimited()).toBe(true);
    expect(getRateLimitInfo().resetsAt).toBe(resetEpoch * 1000);
  });

  it("does not trigger when remaining is above 0", () => {
    updateFromHeaders({
      "x-ratelimit-remaining": "1",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-reset": "9999999999",
    });
    expect(isRateLimited()).toBe(false);
  });
});

describe("isRateLimitError", () => {
  it("detects a 429 status", () => {
    expect(isRateLimitError({ status: 429, message: "Too many requests" })).toBe(true);
  });

  it("detects a 403 with rate limit message", () => {
    expect(
      isRateLimitError({
        status: 403,
        message: "API rate limit exceeded for user ID 123",
      })
    ).toBe(true);
  });

  it("does NOT flag a 403 without rate limit in the message", () => {
    expect(
      isRateLimitError({ status: 403, message: "Resource not accessible" })
    ).toBe(false);
  });

  it("does NOT flag a 401", () => {
    expect(isRateLimitError({ status: 401, message: "Bad credentials" })).toBe(false);
  });

  it("handles null/undefined gracefully", () => {
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe("extractResetFromError", () => {
  it("extracts the reset epoch from an error with response headers", () => {
    expect(
      extractResetFromError({
        status: 403,
        message: "rate limit",
        response: { headers: { "x-ratelimit-reset": "1700000000" } },
      })
    ).toBe(1700000000);
  });

  it("returns undefined for errors without headers", () => {
    expect(extractResetFromError({ status: 403 })).toBeUndefined();
  });
});

describe("isTransientError", () => {
  it("flags 5xx errors as transient", () => {
    expect(isTransientError({ status: 500 })).toBe(true);
    expect(isTransientError({ status: 502 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ status: 504 })).toBe(true);
  });

  it("flags 408 as transient", () => {
    expect(isTransientError({ status: 408 })).toBe(true);
  });

  it("flags network errors as transient", () => {
    expect(isTransientError({ code: "ENOTFOUND" })).toBe(true);
    expect(isTransientError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientError({ message: "fetch failed" })).toBe(true);
    expect(isTransientError({ message: "Network error" })).toBe(true);
  });

  it("does NOT flag 4xx errors as transient", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
    expect(isTransientError({ status: 422 })).toBe(false);
  });

  it("does NOT flag rate limit errors as transient (circuit breaker handles them)", () => {
    expect(
      isTransientError({ status: 403, message: "API rate limit exceeded" })
    ).toBe(false);
    expect(isTransientError({ status: 429 })).toBe(false);
  });

  it("does NOT flag 401 as transient", () => {
    expect(isTransientError({ status: 401 })).toBe(false);
  });
});

describe("isAuthError", () => {
  it("flags 401 as an auth error", () => {
    expect(isAuthError({ status: 401 })).toBe(true);
  });

  it("flags bad credentials message as auth error", () => {
    expect(isAuthError({ status: 401, message: "Bad credentials" })).toBe(true);
    expect(isAuthError({ message: "Bad credentials" })).toBe(true);
  });

  it("does NOT flag 403 as an auth error (could be rate limit or permission)", () => {
    expect(isAuthError({ status: 403 })).toBe(false);
  });

  it("does NOT flag 404 or 500 as auth errors", () => {
    expect(isAuthError({ status: 404 })).toBe(false);
    expect(isAuthError({ status: 500 })).toBe(false);
  });
});

describe("formatApiError", () => {
  beforeEach(() => clearRateLimit());

  it("formats a 401 with a re-authentication prompt", () => {
    const msg = formatApiError({ status: 401, message: "Bad credentials" }, "Failed to load repository");
    expect(msg).toContain("Failed to load repository");
    expect(msg).toMatch(/token is invalid or expired/i);
    expect(msg).toMatch(/Settings/i);
  });

  it("formats a rate limit error with a human reset ETA", () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 600; // ~10 min
    markRateLimited(resetEpoch);
    const msg = formatApiError(
      { status: 403, message: "API rate limit exceeded" },
      "Failed to load PRs"
    );
    expect(msg).toContain("Failed to load PRs");
    expect(msg).toMatch(/rate limit/i);
    expect(msg).toMatch(/minute/);
  });

  it("formats a 404 with a helpful message", () => {
    const msg = formatApiError({ status: 404 }, "Failed to load file");
    expect(msg).toMatch(/not found/i);
  });

  it("formats a 403 (permission, not rate limit) with a token-scope hint", () => {
    const msg = formatApiError({ status: 403, message: "Not accessible" }, "Failed to open PR");
    expect(msg).toMatch(/access denied/i);
    expect(msg).toMatch(/permission/i);
  });

  it("falls back to the raw message for unknown errors", () => {
    const msg = formatApiError({ status: 418, message: "I'm a teapot" }, "Failed to brew");
    expect(msg).toContain("Failed to brew");
    expect(msg).toContain("I'm a teapot");
  });
});
