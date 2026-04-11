/**
 * Tests for mapSelectionToLines.
 *
 * This is the function that realizes the README's promise:
 *
 *   > Select any passage, leave a comment, and have it posted back to
 *   > GitHub as an inline review comment tied to the exact line range.
 *
 * It takes the file's markdown source and the user-selected text and
 * returns { startLine, endLine } in 1-indexed source coordinates.
 * Every PendingInlineComment MarDoc sends to GitHub's
 * pulls.createReview endpoint is tied to line numbers this function
 * produced. If it gets the line wrong, the comment lands in the wrong
 * place — or worse, a `replace` suggestion rewrites the wrong lines.
 *
 * This test file was empty (zero direct coverage) until this commit.
 * Comprehensive coverage of the documented contract + the fuzzy-match
 * fallback + edge cases + known-acceptable degraded behavior.
 */
import { describe, it, expect } from "vitest";
import { mapSelectionToLines } from "@/lib/github-api";

describe("mapSelectionToLines — exact match", () => {
  it("finds a single-word selection on line 1", () => {
    expect(mapSelectionToLines("Hello world.", "Hello")).toEqual({
      startLine: 1,
      endLine: 1,
    });
  });

  it("finds a selection on a middle line", () => {
    const md = "Line one.\nLine two.\nLine three.";
    expect(mapSelectionToLines(md, "two")).toEqual({
      startLine: 2,
      endLine: 2,
    });
  });

  it("finds a selection on the last line", () => {
    const md = "Line one.\nLine two.\nLine three.";
    expect(mapSelectionToLines(md, "three")).toEqual({
      startLine: 3,
      endLine: 3,
    });
  });

  it("handles multi-line selections spanning two lines", () => {
    const md = "first line\nsecond line\nthird line";
    // Select "line\nsecond" — the selection crosses a newline.
    expect(mapSelectionToLines(md, "line\nsecond")).toEqual({
      startLine: 1,
      endLine: 2,
    });
  });

  it("handles multi-line selections spanning three lines", () => {
    const md = "first line\nsecond line\nthird line\nfourth line";
    expect(mapSelectionToLines(md, "second line\nthird line\nfourth")).toEqual({
      startLine: 2,
      endLine: 4,
    });
  });

  it("returns correct lines when the selection is at the very start", () => {
    expect(mapSelectionToLines("AAA\nBBB\nCCC", "AAA")).toEqual({
      startLine: 1,
      endLine: 1,
    });
  });

  it("returns correct lines when the selection is at the very end", () => {
    // Trailing text at end of file — this is a common GitHub shape.
    expect(mapSelectionToLines("AAA\nBBB\nCCC", "CCC")).toEqual({
      startLine: 3,
      endLine: 3,
    });
  });

  it("is case-sensitive on exact matches", () => {
    // "hello" and "Hello" are different; the function must match the
    // exact case before falling back to fuzzy. If it mis-matches,
    // `mapSelectionToLines` could return line 1 instead of the real
    // position, which is where the known `handleAcceptSuggestion` bug
    // came from.
    const md = "Hello world\nhello world";
    expect(mapSelectionToLines(md, "hello world").startLine).toBe(2);
    expect(mapSelectionToLines(md, "Hello world").startLine).toBe(1);
  });

  it("finds the FIRST match when the same text appears twice", () => {
    const md = "foo\nbar\nfoo";
    expect(mapSelectionToLines(md, "foo")).toEqual({
      startLine: 1,
      endLine: 1,
    });
  });
});

describe("mapSelectionToLines — inline formatting", () => {
  it("matches text inside a markdown heading", () => {
    const md = "# Introduction\n\nBody.";
    expect(mapSelectionToLines(md, "Introduction").startLine).toBe(1);
  });

  it("matches text inside a bold-wrapped span", () => {
    // The source contains **bold** with markers; the user's
    // selection might be just "bold" (without the markers).
    const md = "Here is **bold** text.";
    expect(mapSelectionToLines(md, "bold").startLine).toBe(1);
  });

  it("matches across markdown line-break formatting", () => {
    const md = "- item one\n- item two\n- item three";
    expect(mapSelectionToLines(md, "item two").startLine).toBe(2);
  });
});

describe("mapSelectionToLines — whitespace / fuzzy fallback", () => {
  it("handles a selection where internal whitespace collapses", () => {
    // The source has multiple spaces; the DOM-reported selection
    // might normalize them to a single space. The function's fuzzy
    // path should still locate the range.
    const md = "word1  word2   word3";
    const result = mapSelectionToLines(md, "word1 word2 word3");
    expect(result.startLine).toBe(1);
  });

  it("handles a selection that includes a trailing space", () => {
    const md = "Hello world.";
    const result = mapSelectionToLines(md, "Hello ");
    expect(result.startLine).toBe(1);
  });

  it("handles leading whitespace drift", () => {
    const md = "Indented content here.";
    const result = mapSelectionToLines(md, " content ");
    expect(result.startLine).toBe(1);
  });
});

describe("mapSelectionToLines — degraded input (documented fallback)", () => {
  it("returns line 1 for empty selected text (known fallback)", () => {
    // This is the KNOWN destructive behavior that the session
    // uncovered: an empty selectedText collapses to { startLine: 1,
    // endLine: 1 } rather than throwing. Callers that feed
    // `comment.selectedText || ""` to this function — notably
    // handleAcceptSuggestion in PRDetail.tsx — will therefore point
    // at line 1 of the file, not the intended range.
    //
    // This test documents the contract so any future change to the
    // fallback is deliberate. THIS IS NOT A GOOD BEHAVIOR — it just
    // is the current behavior. The fix lives in handleAcceptSuggestion,
    // which should carry line metadata through independently rather
    // than relying on this fallback.
    expect(mapSelectionToLines("line 1\nline 2\nline 3", "")).toEqual({
      startLine: 1,
      endLine: 1,
    });
  });

  it("returns line 1 for a selection that doesn't appear in the source", () => {
    // Same documented fallback.
    expect(
      mapSelectionToLines("actual content", "not in the file")
    ).toEqual({ startLine: 1, endLine: 1 });
  });

  it("returns line 1 for empty source", () => {
    expect(mapSelectionToLines("", "anything")).toEqual({
      startLine: 1,
      endLine: 1,
    });
  });
});

describe("mapSelectionToLines — realistic source documents", () => {
  const realistic = [
    "# API Reference",
    "",
    "This document describes the public API.",
    "",
    "## Authentication",
    "",
    "All requests require a bearer token. Pass it in the",
    "`Authorization: Bearer <token>` header.",
    "",
    "## Errors",
    "",
    "| Code | Meaning       |",
    "| ---- | ------------- |",
    "| 401  | Unauthorized  |",
    "| 404  | Not found     |",
    "| 500  | Server error  |",
    "",
    "```js",
    "fetch('/api/users')",
    "  .then(r => r.json())",
    "```",
    "",
    "Closing notes.",
  ].join("\n");

  it("locates a heading title", () => {
    expect(mapSelectionToLines(realistic, "API Reference").startLine).toBe(1);
  });

  it("locates a paragraph in the middle", () => {
    expect(mapSelectionToLines(realistic, "bearer token").startLine).toBe(7);
  });

  it("locates a row inside a table", () => {
    expect(mapSelectionToLines(realistic, "Unauthorized").startLine).toBe(14);
  });

  it("locates a line inside a fenced code block", () => {
    const r = mapSelectionToLines(realistic, "fetch('/api/users')");
    expect(r.startLine).toBe(19);
    expect(r.endLine).toBe(19);
  });

  it("locates multi-line selections across the table", () => {
    const r = mapSelectionToLines(
      realistic,
      "| 404  | Not found     |\n| 500  | Server error  |"
    );
    expect(r.startLine).toBe(15);
    expect(r.endLine).toBe(16);
  });

  it("locates the closing note", () => {
    expect(mapSelectionToLines(realistic, "Closing notes").startLine).toBe(23);
  });
});
