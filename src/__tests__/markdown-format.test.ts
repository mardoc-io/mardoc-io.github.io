/**
 * Tests for the pure markdown formatting helpers extracted from
 * DiffViewer.tsx. These functions back the MarkdownToolbar and the
 * SuggestBlockEditor keyboard shortcuts — getting them wrong would
 * corrupt user edits, so every branch gets explicit coverage.
 */
import { describe, it, expect } from "vitest";
import {
  applyWrap,
  applyLinePrefix,
  applyCodeBlock,
  applyHorizontalRule,
  applyLink,
} from "@/lib/markdown-format";

// ─── applyWrap ────────────────────────────────────────────────────

describe("applyWrap", () => {
  it("wraps a selected range with prefix and suffix", () => {
    const r = applyWrap("hello world", 0, 5, "**", "**");
    expect(r.text).toBe("**hello** world");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(7);
  });

  it("inserts a 'text' placeholder when nothing is selected", () => {
    const r = applyWrap("", 0, 0, "**", "**");
    expect(r.text).toBe("**text**");
    expect(r.selStart).toBe(2);
    expect(r.selEnd).toBe(6);
  });

  it("wraps in the middle of a string without disturbing the rest", () => {
    const r = applyWrap("abc def ghi", 4, 7, "_", "_");
    expect(r.text).toBe("abc _def_ ghi");
    expect(r.selStart).toBe(5);
    expect(r.selEnd).toBe(8);
  });

  it("handles different prefix and suffix (asymmetric)", () => {
    const r = applyWrap("cat", 0, 3, "[", "](url)");
    expect(r.text).toBe("[cat](url)");
    expect(r.selStart).toBe(1);
    expect(r.selEnd).toBe(4);
  });
});

// ─── applyLinePrefix ──────────────────────────────────────────────

describe("applyLinePrefix", () => {
  it("prepends a prefix to the line containing the cursor", () => {
    const r = applyLinePrefix("hello", 2, 2, "# ");
    expect(r.text).toBe("# hello");
    expect(r.selStart).toBe(4);
    expect(r.selEnd).toBe(4);
  });

  it("finds the start of the current line across multi-line text", () => {
    const text = "first\nsecond\nthird";
    // Cursor on 'second' at position 8
    const r = applyLinePrefix(text, 8, 8, "- ");
    expect(r.text).toBe("first\n- second\nthird");
  });

  it("toggles the prefix off when it's already present", () => {
    const r = applyLinePrefix("# hello", 4, 4, "# ");
    expect(r.text).toBe("hello");
  });

  it("keeps selection stable when toggling off", () => {
    // "## foo", cursor on "f" at 3, toggle "## " off
    const r = applyLinePrefix("## foo", 3, 3, "## ");
    expect(r.text).toBe("foo");
    expect(r.selStart).toBe(0);
    expect(r.selEnd).toBe(0);
  });

  it("handles the last line with no trailing newline", () => {
    const text = "first\nlast";
    const r = applyLinePrefix(text, 8, 8, "> ");
    expect(r.text).toBe("first\n> last");
  });

  it("works on a single-word blockquote toggle", () => {
    const r = applyLinePrefix("> cite", 2, 2, "> ");
    expect(r.text).toBe("cite");
  });
});

// ─── applyCodeBlock ───────────────────────────────────────────────

describe("applyCodeBlock", () => {
  it("wraps selection in a fenced code block", () => {
    const r = applyCodeBlock("const x = 1;", 0, 12);
    expect(r.text).toBe("```\nconst x = 1;\n```");
    expect(r.selStart).toBe(4);
    expect(r.selEnd).toBe(16);
  });

  it("inserts an empty fenced block when nothing is selected", () => {
    const r = applyCodeBlock("", 0, 0);
    expect(r.text).toBe("```\n\n```");
    expect(r.selStart).toBe(4);
    expect(r.selEnd).toBe(4);
  });
});

// ─── applyHorizontalRule ──────────────────────────────────────────

describe("applyHorizontalRule", () => {
  it("inserts a horizontal rule at the cursor", () => {
    const r = applyHorizontalRule("before after", 6, 6);
    expect(r.text).toBe("before\n---\n after");
  });

  it("places the cursor after the inserted hr", () => {
    const r = applyHorizontalRule("x", 1, 1);
    expect(r.selStart).toBe(6);
    expect(r.selEnd).toBe(6);
  });
});

// ─── applyLink ────────────────────────────────────────────────────

describe("applyLink", () => {
  it("wraps selected text as the link text with 'url' selected", () => {
    const r = applyLink("click here", 0, 10);
    expect(r.text).toBe("[click here](url)");
    // "url" is the 3 characters before the closing paren
    expect(r.text.slice(r.selStart, r.selEnd)).toBe("url");
  });

  it("inserts a [text](url) placeholder with 'text' selected when nothing is selected", () => {
    const r = applyLink("", 0, 0);
    expect(r.text).toBe("[text](url)");
    expect(r.text.slice(r.selStart, r.selEnd)).toBe("text");
  });
});
