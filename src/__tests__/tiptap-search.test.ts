/**
 * Tests for the pure search helpers used by the rich-view find/replace
 * TipTap extension.
 *
 * A TipTap / ProseMirror document is a tree of nodes with an
 * opaque "position" numbering system (blocks contribute 2 positions
 * for their open/close tokens, text contributes 1 per character).
 * Rather than testing against a real PM instance (heavy, jsdom has
 * edge cases), we define a "text run" — a string of contiguous
 * characters paired with its starting doc position — and test the
 * search logic against that minimal shape.
 *
 * The real TipTap extension walks the doc with `doc.descendants` and
 * produces a list of these runs. The pure helper takes the runs and
 * the query and returns { from, to } ranges in doc position space.
 */
import { describe, it, expect } from "vitest";
import {
  findMatchesInRuns,
  type TextRun,
  type DocMatch,
} from "@/lib/tiptap-search";

describe("findMatchesInRuns", () => {
  // ─── Empty / trivial ───────────────────────────────────────────────────

  it("returns empty for no runs", () => {
    expect(findMatchesInRuns([], "foo", {})).toEqual([]);
  });

  it("returns empty for empty query", () => {
    const runs: TextRun[] = [{ text: "hello world", docPos: 1 }];
    expect(findMatchesInRuns(runs, "", {})).toEqual([]);
  });

  it("returns empty when query is not found", () => {
    const runs: TextRun[] = [{ text: "hello world", docPos: 1 }];
    expect(findMatchesInRuns(runs, "xyzzy", {})).toEqual([]);
  });

  // ─── Single run ────────────────────────────────────────────────────────

  it("finds a match within a single run and maps to doc positions", () => {
    // Run starts at doc position 1 (first position inside a paragraph).
    // "hello world" → "world" is at plain index 6, length 5.
    // Doc positions: from=1+6=7, to=7+5=12.
    const runs: TextRun[] = [{ text: "hello world", docPos: 1 }];
    const matches = findMatchesInRuns(runs, "world", {});
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 7, to: 12 });
  });

  it("finds multiple matches within a single run", () => {
    const runs: TextRun[] = [{ text: "foo bar foo", docPos: 1 }];
    const matches = findMatchesInRuns(runs, "foo", {});
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ from: 1, to: 4 });
    expect(matches[1]).toEqual({ from: 9, to: 12 });
  });

  // ─── Multiple runs (typical PM doc with formatting) ────────────────────

  it("finds matches across multiple runs within the same block", () => {
    // ProseMirror splits text by mark boundaries: "hello **world**" is
    // two runs — "hello " at pos 1, "world" at pos 7 (after the space).
    // A search for "world" should find it at pos 7.
    const runs: TextRun[] = [
      { text: "hello ", docPos: 1 },
      { text: "world", docPos: 7 },
    ];
    const matches = findMatchesInRuns(runs, "world", {});
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 7, to: 12 });
  });

  it("finds each run's matches independently when they don't cross", () => {
    const runs: TextRun[] = [
      { text: "foo", docPos: 1 },
      { text: "bar", docPos: 6 },
      { text: "foo", docPos: 11 },
    ];
    const matches = findMatchesInRuns(runs, "foo", {});
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.from)).toEqual([1, 11]);
  });

  // ─── Case sensitivity ─────────────────────────────────────────────────

  it("is case-insensitive by default", () => {
    const runs: TextRun[] = [{ text: "Hello HELLO hello", docPos: 1 }];
    expect(findMatchesInRuns(runs, "hello", {})).toHaveLength(3);
  });

  it("honors caseSensitive: true", () => {
    const runs: TextRun[] = [{ text: "Hello HELLO hello", docPos: 1 }];
    const matches = findMatchesInRuns(runs, "hello", { caseSensitive: true });
    expect(matches).toHaveLength(1);
    expect(matches[0].from).toBe(13); // "hello" starts at plain index 12, doc pos 13
  });

  // ─── Whole word ───────────────────────────────────────────────────────

  it("honors wholeWord: true on a single run", () => {
    const runs: TextRun[] = [{ text: "car cart scar", docPos: 1 }];
    const matches = findMatchesInRuns(runs, "car", { wholeWord: true });
    expect(matches).toHaveLength(1);
    expect(matches[0].from).toBe(1);
  });

  // ─── Regex mode ───────────────────────────────────────────────────────

  it("supports regex queries", () => {
    const runs: TextRun[] = [{ text: "2024-01-15 and 2025-12-31", docPos: 1 }];
    const matches = findMatchesInRuns(
      runs,
      "\\d{4}-\\d{2}-\\d{2}",
      { regex: true }
    );
    expect(matches).toHaveLength(2);
  });

  it("returns empty for an invalid regex instead of throwing", () => {
    const runs: TextRun[] = [{ text: "hello", docPos: 1 }];
    expect(findMatchesInRuns(runs, "(invalid", { regex: true })).toEqual([]);
  });

  // ─── Block boundaries ─────────────────────────────────────────────────

  it("does NOT match text that spans a block boundary", () => {
    // Two paragraphs produce two runs separated in doc position space by
    // the block open/close tokens. A search for "worldhello" should NOT
    // match across the boundary — block separators are semantic.
    const runs: TextRun[] = [
      { text: "hello world", docPos: 1 },
      { text: "hello world", docPos: 14 }, // after </p><p> opens
    ];
    const matches = findMatchesInRuns(runs, "worldhello", {});
    expect(matches).toEqual([]);
  });

  it("handles the same query appearing in separate blocks independently", () => {
    const runs: TextRun[] = [
      { text: "first hello", docPos: 1 },
      { text: "second hello", docPos: 14 },
    ];
    const matches = findMatchesInRuns(runs, "hello", {});
    expect(matches).toHaveLength(2);
    expect(matches[0].from).toBe(7);  // "hello" at plain index 6 in run 0, doc pos 7
    expect(matches[1].from).toBe(21); // "hello" at plain index 7 in run 1, doc pos 21
  });

  // ─── Ordering ─────────────────────────────────────────────────────────

  it("returns matches in ascending doc-position order", () => {
    const runs: TextRun[] = [
      { text: "foo", docPos: 100 },
      { text: "foo", docPos: 10 },
      { text: "foo", docPos: 50 },
    ];
    const matches = findMatchesInRuns(runs, "foo", {});
    expect(matches.map((m) => m.from)).toEqual([10, 50, 100]);
  });
});
