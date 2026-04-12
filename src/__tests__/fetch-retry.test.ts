import { describe, it, expect, vi } from "vitest";
import { withRetry, computeBackoff } from "@/lib/fetch-retry";

describe("withRetry", () => {
  it("returns the value on a successful first call", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient 5xx errors up to maxAttempts", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce("ok");
    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 2 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last transient error after maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 500, message: "boom" });
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 })
    ).rejects.toMatchObject({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a 404", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 404 });
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 401 auth error", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401 });
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toMatchObject({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a rate-limit error (circuit breaker handles it)", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 403, message: "API rate limit exceeded" });
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toMatchObject({ status: 403 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a network error and then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: "ENOTFOUND" })
      .mockResolvedValueOnce("recovered");
    expect(await withRetry(fn, { baseDelayMs: 1 })).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("computeBackoff", () => {
  it("grows exponentially with attempt number", () => {
    // Run many times and take medians to average out jitter
    const samples = (attempt: number) =>
      Array.from({ length: 50 }, () => computeBackoff(attempt, 500, 100_000));
    const median = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };
    const m1 = median(samples(1));
    const m2 = median(samples(2));
    const m3 = median(samples(3));
    expect(m2).toBeGreaterThan(m1);
    expect(m3).toBeGreaterThan(m2);
  });

  it("caps at maxDelayMs even for high attempt numbers", () => {
    const delay = computeBackoff(20, 500, 4000);
    // 500 * 2^19 would be 262144000; must be capped near 4000.
    // Allow 25% jitter on top of the cap.
    expect(delay).toBeLessThanOrEqual(4000 * 1.25 + 1);
  });

  it("returns a non-negative number", () => {
    for (let i = 1; i <= 10; i++) {
      expect(computeBackoff(i, 100, 1000)).toBeGreaterThanOrEqual(0);
    }
  });
});
