import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  markRateLimited,
  isRateLimited,
  clearRateLimit,
  updateFromHeaders,
  isRateLimitError,
  extractResetFromError,
  getRateLimitInfo,
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
