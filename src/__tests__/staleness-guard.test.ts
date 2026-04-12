import { describe, it, expect } from "vitest";
import { createStalenessGuard } from "@/lib/staleness-guard";

describe("createStalenessGuard", () => {
  it("returns true when no newer call has started", () => {
    const guard = createStalenessGuard();
    const isCurrent = guard.begin();
    expect(isCurrent()).toBe(true);
  });

  it("returns false after a newer call has started", () => {
    const guard = createStalenessGuard();
    const firstIsCurrent = guard.begin();
    guard.begin();
    expect(firstIsCurrent()).toBe(false);
  });

  it("the newest call is always current", () => {
    const guard = createStalenessGuard();
    guard.begin();
    guard.begin();
    const third = guard.begin();
    expect(third()).toBe(true);
  });

  it("survives concurrent async work — only the latest wins", async () => {
    const guard = createStalenessGuard();
    const results: string[] = [];

    // Three overlapping loads; only the last should commit.
    const load = async (label: string, delay: number) => {
      const isCurrent = guard.begin();
      await new Promise((r) => setTimeout(r, delay));
      if (!isCurrent()) return;
      results.push(label);
    };

    // Start all three without awaiting.
    const a = load("first", 30);
    const b = load("second", 10);
    const c = load("third", 20);
    await Promise.all([a, b, c]);

    // Only "third" (the most recently begun, which is the youngest
    // generation) survives its isCurrent check.
    expect(results).toEqual(["third"]);
  });

  it("invalidate() makes all prior guards stale", () => {
    const guard = createStalenessGuard();
    const isCurrent = guard.begin();
    expect(isCurrent()).toBe(true);
    guard.invalidate();
    expect(isCurrent()).toBe(false);
  });

  it("guards from different instances don't interfere", () => {
    const a = createStalenessGuard();
    const b = createStalenessGuard();
    const aCurrent = a.begin();
    b.begin();
    b.begin();
    expect(aCurrent()).toBe(true);
  });
});
