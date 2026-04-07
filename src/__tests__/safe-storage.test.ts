import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getItem, setItem, removeItem } from "@/lib/safe-storage";

describe("safe-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Normal operation ──────────────────────────────────────────────

  it("getItem returns stored value", () => {
    localStorage.setItem("key", "value");
    expect(getItem("key")).toBe("value");
  });

  it("getItem returns null for missing key", () => {
    expect(getItem("missing")).toBeNull();
  });

  it("setItem stores a value", () => {
    setItem("key", "value");
    expect(localStorage.getItem("key")).toBe("value");
  });

  it("removeItem removes a value", () => {
    localStorage.setItem("key", "value");
    removeItem("key");
    expect(localStorage.getItem("key")).toBeNull();
  });

  // ─── Error handling (private browsing / restricted contexts) ───────

  it("getItem returns null when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });
    expect(getItem("key")).toBeNull();
  });

  it("setItem is a no-op when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    // Should not throw
    expect(() => setItem("key", "value")).not.toThrow();
  });

  it("removeItem is a no-op when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("access denied", "SecurityError");
    });
    expect(() => removeItem("key")).not.toThrow();
  });
});
