/**
 * Tests for the find/replace helpers — pure string-level operations used
 * by the code-view find bar. Written test-first so the contract is
 * defined here before any caller exists.
 *
 * Rich-view find/replace is deliberately out of scope for this module.
 */
import { describe, it, expect } from "vitest";
import {
  findAll,
  replaceAt,
  replaceAll,
  type FindOptions,
  type Match,
} from "@/lib/find-replace";

describe("findAll", () => {
  // ─── Trivial ────────────────────────────────────────────────────────────

  it("returns empty when the query is empty", () => {
    expect(findAll("any text", "")).toEqual([]);
  });

  it("returns empty when the text is empty", () => {
    expect(findAll("", "foo")).toEqual([]);
  });

  it("returns empty when the query is not found", () => {
    expect(findAll("hello world", "xyzzy")).toEqual([]);
  });

  // ─── Basic matches ──────────────────────────────────────────────────────

  it("finds a single match and returns its span", () => {
    const matches = findAll("hello world", "world");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ start: 6, end: 11 });
  });

  it("finds multiple non-overlapping matches", () => {
    const matches = findAll("foo bar foo baz foo", "foo");
    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({ start: 0, end: 3 });
    expect(matches[1]).toEqual({ start: 8, end: 11 });
    expect(matches[2]).toEqual({ start: 16, end: 19 });
  });

  it("returns matches in ascending order of start position", () => {
    const matches = findAll("aaa", "a");
    expect(matches.map((m) => m.start)).toEqual([0, 1, 2]);
  });

  // ─── Case sensitivity ───────────────────────────────────────────────────

  it("is case-insensitive by default", () => {
    const matches = findAll("Hello HELLO hello", "hello");
    expect(matches).toHaveLength(3);
  });

  it("honors caseSensitive: true", () => {
    const matches = findAll("Hello HELLO hello", "hello", { caseSensitive: true });
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toBe(12);
  });

  // ─── Special regex characters in literal queries ───────────────────────

  it("escapes regex metacharacters when regex is off", () => {
    // `.` must match a literal dot, not any character.
    const matches = findAll("a.b axb", ".", { regex: false });
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toBe(1);
  });

  it("treats $ and ^ as literals in non-regex mode", () => {
    const matches = findAll("price is $10", "$10");
    expect(matches).toHaveLength(1);
  });

  it("treats parentheses as literals in non-regex mode", () => {
    expect(findAll("call foo() here", "()").length).toBe(1);
  });

  // ─── Regex mode ─────────────────────────────────────────────────────────

  it("interprets the query as a regex when regex: true", () => {
    const matches = findAll("cat rat bat mat", "[cb]at", { regex: true });
    expect(matches).toHaveLength(2);
  });

  it("returns empty for an invalid regex instead of throwing", () => {
    // Unbalanced paren — previously this would crash the find panel.
    expect(findAll("any text", "(invalid", { regex: true })).toEqual([]);
  });

  it("handles zero-width regex matches without infinite-looping", () => {
    // `^` matches at every line start — our finder must advance past
    // zero-width matches or the loop runs forever.
    const matches = findAll("line\nline\nline", "^", { regex: true });
    expect(matches).toEqual([]); // zero-width matches skipped entirely
  });

  // ─── Whole word ─────────────────────────────────────────────────────────

  it("honors wholeWord: true", () => {
    const matches = findAll("car cart scar", "car", { wholeWord: true });
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toBe(0);
  });

  it("wholeWord considers punctuation as a boundary", () => {
    const matches = findAll("cat, cats (cat).", "cat", { wholeWord: true });
    // "cat" at 0, "cat" at 11 — "cats" is not a whole-word match.
    expect(matches).toHaveLength(2);
  });

  // ─── Combinations ───────────────────────────────────────────────────────

  it("combines caseSensitive + wholeWord", () => {
    const matches = findAll("Foo foo FOO bar", "foo", {
      caseSensitive: true,
      wholeWord: true,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].start).toBe(4);
  });
});

describe("replaceAt", () => {
  it("replaces the text at a single match position", () => {
    const text = "hello world";
    const match: Match = { start: 6, end: 11 };
    expect(replaceAt(text, match, "there")).toBe("hello there");
  });

  it("handles an empty replacement (delete at the match)", () => {
    expect(replaceAt("foo bar baz", { start: 4, end: 7 }, "")).toBe("foo  baz");
  });

  it("handles a replacement longer than the original", () => {
    expect(replaceAt("x", { start: 0, end: 1 }, "expanded")).toBe("expanded");
  });

  it("handles a replacement at the start of the text", () => {
    expect(replaceAt("abc", { start: 0, end: 1 }, "X")).toBe("Xbc");
  });

  it("handles a replacement at the end of the text", () => {
    expect(replaceAt("abc", { start: 2, end: 3 }, "X")).toBe("abX");
  });
});

describe("replaceAll", () => {
  it("replaces every match of a literal query", () => {
    expect(replaceAll("foo bar foo baz foo", "foo", "qux")).toBe("qux bar qux baz qux");
  });

  it("returns text unchanged when there are no matches", () => {
    expect(replaceAll("hello", "xyz", "abc")).toBe("hello");
  });

  it("returns text unchanged when the query is empty", () => {
    expect(replaceAll("hello", "", "abc")).toBe("hello");
  });

  it("preserves the position of unmatched content", () => {
    // Regression: a left-to-right naive replacement would shift indices.
    // Replacing short→long then long→short must still produce correct text.
    const input = "abc abc abc";
    const result = replaceAll(input, "abc", "XYZW");
    expect(result).toBe("XYZW XYZW XYZW");
  });

  it("honors caseSensitive", () => {
    expect(replaceAll("Foo foo FOO", "foo", "bar", { caseSensitive: true })).toBe(
      "Foo bar FOO"
    );
  });

  it("honors regex mode", () => {
    const input = "2024-01-15 and 2025-12-31";
    expect(
      replaceAll(input, "\\d{4}-\\d{2}-\\d{2}", "DATE", { regex: true })
    ).toBe("DATE and DATE");
  });

  it("honors wholeWord", () => {
    expect(replaceAll("car cart scar", "car", "bus", { wholeWord: true })).toBe(
      "bus cart scar"
    );
  });

  it("handles replacement text that contains the query", () => {
    // "a" → "aa" should not infinite-loop or double-expand.
    expect(replaceAll("a a a", "a", "aa")).toBe("aa aa aa");
  });
});
