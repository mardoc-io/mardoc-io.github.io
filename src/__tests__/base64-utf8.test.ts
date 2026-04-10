import { describe, it, expect } from "vitest";
import { utf8ToBase64, base64ToUtf8 } from "@/lib/base64-utf8";

describe("base64-utf8", () => {
  // ─── Round-trip identity ────────────────────────────────────────────────

  it("round-trips ASCII content", () => {
    const text = "# Hello world\n\n- item 1\n- item 2";
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it("round-trips empty string", () => {
    expect(base64ToUtf8(utf8ToBase64(""))).toBe("");
  });

  it("round-trips single newline", () => {
    expect(base64ToUtf8(utf8ToBase64("\n"))).toBe("\n");
  });

  // ─── The bug the btoa fix was for ──────────────────────────────────────

  it("handles emoji without throwing (btoa would crash)", () => {
    const text = "# 🚀 launch day";
    const encoded = utf8ToBase64(text);
    expect(base64ToUtf8(encoded)).toBe(text);
  });

  it("handles em-dash without throwing (real bug from production)", () => {
    const text = "Command injection — validate inputs before shell exec";
    const encoded = utf8ToBase64(text);
    expect(base64ToUtf8(encoded)).toBe(text);
  });

  it("handles CJK characters", () => {
    const text = "中文测试\n日本語\n한국어";
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it("handles accented Latin characters", () => {
    const text = "Café résumé naïve über";
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it("handles a mix of scripts, emoji, and control characters", () => {
    const text = "🎯 Goal: 中文 + English — résumé\n\tindent\rcarriage";
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it("handles the maximum BMP codepoint", () => {
    const text = String.fromCodePoint(0xffff);
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it("handles supplementary plane characters (surrogate pairs)", () => {
    // Mathematical script capital A, outside the BMP
    const text = "\u{1D49C}";
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  // ─── Regression guard: plain btoa() would throw here ───────────────────

  it("plain btoa() would throw on unicode (sanity check of the problem)", () => {
    // Browsers error message differs: "The string to be encoded contains
    // characters outside of the Latin1 range" in Chrome/Firefox,
    // "Invalid character" in jsdom. Just assert the throw.
    expect(() => btoa("em—dash")).toThrow();
  });

  it("utf8ToBase64 does not throw on any of the plain-btoa failure cases", () => {
    const cases = ["em—dash", "🚀", "中文", "café"];
    for (const c of cases) {
      expect(() => utf8ToBase64(c)).not.toThrow();
    }
  });

  // ─── Interop with GitHub's base64 wire format ──────────────────────────

  it("produces output that a standard base64 decoder can read", () => {
    // GitHub's API returns content as base64. Our encoder must produce the
    // same format so the content round-trips through the GitHub API.
    const text = "hello";
    const encoded = utf8ToBase64(text);
    // Standard base64 for "hello" is "aGVsbG8="
    expect(encoded).toBe("aGVsbG8=");
  });

  it("decodes a base64 string produced by a standard encoder", () => {
    // "hello world" as base64
    expect(base64ToUtf8("aGVsbG8gd29ybGQ=")).toBe("hello world");
  });
});
