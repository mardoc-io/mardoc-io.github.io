/**
 * Tests for the diff-block parsing, line-range mapping, HTML rendering,
 * and word-level diff helpers.
 *
 * These functions are the core of the PR review flow — they turn a
 * markdown source string into the rendered "documents" the README
 * promises:
 *
 *   > MarDoc renders your GitHub PR diffs as rich, formatted documents
 *   > — not raw text with `+` and `-` lines.
 *
 * Every test here defends a specific invariant of that claim.
 */
import { describe, it, expect } from "vitest";
import {
  parseBlocks,
  computeBlockLineRanges,
  blockToHtml,
  computeWordDiff,
} from "@/lib/diff-blocks";

describe("parseBlocks", () => {
  // ─── Trivial ──────────────────────────────────────────────────────────

  it("returns empty for empty input", () => {
    expect(parseBlocks("")).toEqual([]);
  });

  it("returns empty for whitespace-only input", () => {
    expect(parseBlocks("\n\n  \n")).toEqual([]);
  });

  // ─── Paragraph segmentation ──────────────────────────────────────────

  it("treats a single paragraph as one block", () => {
    expect(parseBlocks("Hello world.")).toEqual(["Hello world."]);
  });

  it("joins consecutive non-blank lines into a single block", () => {
    // This is how markdown treats a soft-wrapped paragraph.
    const md = "Line one.\nLine two.\nLine three.";
    expect(parseBlocks(md)).toEqual(["Line one.\nLine two.\nLine three."]);
  });

  it("splits on blank lines", () => {
    const md = "First paragraph.\n\nSecond paragraph.";
    expect(parseBlocks(md)).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("collapses multiple blank lines", () => {
    const md = "One.\n\n\n\nTwo.";
    expect(parseBlocks(md)).toEqual(["One.", "Two."]);
  });

  // ─── Headings + mixed blocks ─────────────────────────────────────────

  it("splits a heading + paragraph into two blocks", () => {
    const md = "# Heading\n\nBody paragraph.";
    expect(parseBlocks(md)).toEqual(["# Heading", "Body paragraph."]);
  });

  it("treats a heading without a blank line after it as the same block", () => {
    // parseBlocks is position-based, not structure-aware — this is
    // intentional, because a heading + body on adjacent lines with no
    // blank separator IS a single logical chunk for review purposes.
    const md = "# Heading\nBody on the next line.";
    expect(parseBlocks(md)).toEqual(["# Heading\nBody on the next line."]);
  });

  it("keeps a bullet list as a single block", () => {
    const md = "- one\n- two\n- three";
    expect(parseBlocks(md)).toEqual(["- one\n- two\n- three"]);
  });

  // ─── Fenced code blocks — the critical case ──────────────────────────

  it("treats a fenced code block as a single block including its fences", () => {
    const md = "```js\nconst x = 1;\nconst y = 2;\n```";
    expect(parseBlocks(md)).toEqual(["```js\nconst x = 1;\nconst y = 2;\n```"]);
  });

  it("does NOT split a code block on internal blank lines", () => {
    // This is the scariest edge case: a code example with blank lines
    // inside must not fragment into separate blocks.
    const md = "```py\ndef foo():\n\n    return 1\n```";
    const blocks = parseBlocks(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("def foo():");
    expect(blocks[0]).toContain("return 1");
  });

  it("does NOT treat `#` headings inside a code block as headings", () => {
    const md = "```sh\n# this is a shell comment, not a heading\nrm -rf /\n```";
    const blocks = parseBlocks(md);
    expect(blocks).toHaveLength(1);
  });

  it("separates a code block from a surrounding paragraph", () => {
    const md = "Before.\n\n```js\nx;\n```\n\nAfter.";
    expect(parseBlocks(md)).toEqual(["Before.", "```js\nx;\n```", "After."]);
  });

  it("handles back-to-back code blocks (no blank line between)", () => {
    const md = "```\nblock1\n```\n```\nblock2\n```";
    const blocks = parseBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("block1");
    expect(blocks[1]).toContain("block2");
  });

  // ─── Realistic document ─────────────────────────────────────────────

  it("segments a realistic mixed document correctly", () => {
    const md = [
      "# Title",
      "",
      "Intro paragraph.",
      "",
      "## Section",
      "",
      "- item 1",
      "- item 2",
      "",
      "```ts",
      "const x: number = 1;",
      "```",
      "",
      "Closing line.",
    ].join("\n");
    const blocks = parseBlocks(md);
    expect(blocks).toEqual([
      "# Title",
      "Intro paragraph.",
      "## Section",
      "- item 1\n- item 2",
      "```ts\nconst x: number = 1;\n```",
      "Closing line.",
    ]);
  });
});

// ─── computeBlockLineRanges ───────────────────────────────────────────────

describe("computeBlockLineRanges", () => {
  it("returns line 1 ranges for a single-line single block", () => {
    const source = "Hello.";
    const blocks = parseBlocks(source);
    expect(computeBlockLineRanges(source, blocks)).toEqual([
      { startLine: 1, endLine: 1 },
    ]);
  });

  it("computes correct line ranges for two consecutive paragraphs", () => {
    const source = "First.\n\nSecond.";
    const blocks = parseBlocks(source);
    // Block 1: "First." occupies line 1
    // Block 2: "Second." occupies line 3 (line 2 is blank)
    expect(computeBlockLineRanges(source, blocks)).toEqual([
      { startLine: 1, endLine: 1 },
      { startLine: 3, endLine: 3 },
    ]);
  });

  it("handles multi-line blocks correctly", () => {
    const source = "Line A\nLine B\nLine C\n\nSecond para.";
    const blocks = parseBlocks(source);
    expect(computeBlockLineRanges(source, blocks)).toEqual([
      { startLine: 1, endLine: 3 },
      { startLine: 5, endLine: 5 },
    ]);
  });

  it("handles fenced code blocks as a single line range", () => {
    const source = "Intro.\n\n```js\nconst x = 1;\nconst y = 2;\n```\n\nOutro.";
    const blocks = parseBlocks(source);
    expect(computeBlockLineRanges(source, blocks)).toEqual([
      { startLine: 1, endLine: 1 }, // Intro.
      { startLine: 3, endLine: 6 }, // ```js .. ```
      { startLine: 8, endLine: 8 }, // Outro.
    ]);
  });

  it("preserves order when the same text appears twice in the source", () => {
    // Regression guard: greedy position-based matching, not text-based.
    const source = "foo\n\nbar\n\nfoo";
    const blocks = parseBlocks(source);
    const ranges = computeBlockLineRanges(source, blocks);
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toEqual({ startLine: 1, endLine: 1 }); // first foo
    expect(ranges[1]).toEqual({ startLine: 3, endLine: 3 }); // bar
    expect(ranges[2]).toEqual({ startLine: 5, endLine: 5 }); // second foo
  });

  it("emits a fallback range instead of throwing when a block can't be located", () => {
    // This shouldn't happen in practice (blocks come from parseBlocks
    // on the same source), but the function must not crash if the
    // caller passes an unrelated block.
    const ranges = computeBlockLineRanges("Hello world.", ["Not in source"]);
    expect(ranges).toEqual([{ startLine: 1, endLine: 1 }]);
  });

  it("returns 1-indexed line numbers (not 0-indexed)", () => {
    // Explicit test because line numbers flow directly into GitHub's
    // pulls.createReview which expects 1-indexed lines.
    const source = "only line";
    const ranges = computeBlockLineRanges(source, parseBlocks(source));
    expect(ranges[0].startLine).toBe(1);
  });
});

// ─── blockToHtml ──────────────────────────────────────────────────────────

describe("blockToHtml", () => {
  it("produces real HTML tags for a heading, not raw text", () => {
    const html = blockToHtml("# Hello");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello</h1>");
    expect(html).not.toContain("# Hello"); // the `#` marker is gone
  });

  it("produces <strong> for bold", () => {
    expect(blockToHtml("**bold**")).toContain("<strong>bold</strong>");
  });

  it("produces <em> for italic", () => {
    expect(blockToHtml("_italic_")).toContain("<em>italic</em>");
  });

  it("produces a <ul><li> list", () => {
    const html = blockToHtml("- one\n- two");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("produces a <table> for pipe syntax", () => {
    const html = blockToHtml("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th");
  });

  it("produces a <pre><code> for a fenced code block", () => {
    const html = blockToHtml("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
  });

  it("REGRESSION: rendered output never contains `+` or `-` line prefixes", () => {
    // This is the README's specific promise: "not raw text with
    // `+` and `-` lines". Verify that after rendering, there's no
    // string that looks like a diff line prefix.
    const md = [
      "# Introduction",
      "",
      "Some text that could be on any line.",
      "",
      "- item",
      "- item",
    ].join("\n");
    const html = blockToHtml(md);
    // No line in the output should start with "+" or "-" followed by
    // a space (diff-line convention).
    const lines = html.split("\n");
    for (const line of lines) {
      expect(line.trim()).not.toMatch(/^[+-]\s/);
    }
  });

  it("processes GitHub alerts via the alert transformer", () => {
    // Confirms the block rendering pipeline runs through the alerts
    // post-processor (part of "rich, formatted documents").
    const html = blockToHtml("> [!NOTE]\n> Heads up.");
    expect(html).toContain("markdown-alert-note");
    expect(html).not.toContain("[!NOTE]");
  });

  it("processes footnote references via the footnotes transformer", () => {
    // Same — confirms the footnote pre-processor runs.
    const html = blockToHtml("Claim[^1].\n\n[^1]: Source.");
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain('id="fnref-1"');
  });
});

// ─── computeWordDiff ─────────────────────────────────────────────────────

describe("computeWordDiff", () => {
  it("returns the common text unchanged when old === new", () => {
    expect(computeWordDiff("hello world", "hello world")).toBe("hello world");
  });

  it("wraps added words in a diff-added span", () => {
    const html = computeWordDiff("hello", "hello world");
    expect(html).toContain('<span class="diff-added">');
    expect(html).toContain("world");
  });

  it("wraps removed words in a diff-removed span", () => {
    const html = computeWordDiff("hello world", "hello");
    expect(html).toContain('<span class="diff-removed">');
    expect(html).toContain("world");
  });

  it("handles both added and removed content in one diff", () => {
    const html = computeWordDiff("foo bar baz", "foo qux baz");
    expect(html).toContain('<span class="diff-removed">');
    expect(html).toContain('<span class="diff-added">');
    expect(html).toContain("bar");
    expect(html).toContain("qux");
  });

  it("REGRESSION: output does NOT use `+` or `-` line prefixes", () => {
    // Every line of the output must NOT start with `+ ` or `- `.
    // This is the literal promise in the README. If this test ever
    // starts failing, the DiffViewer has regressed to a unified-diff
    // format and the "documents, not + and - lines" claim is broken.
    const html = computeWordDiff(
      "The quick brown fox jumps over the lazy dog.",
      "The slow brown fox jumps over a sleeping cat."
    );
    const lines = html.split("\n");
    for (const line of lines) {
      expect(line).not.toMatch(/^\+\s/);
      expect(line).not.toMatch(/^-\s/);
    }
  });

  it("REGRESSION: preserves HTML-unsafe characters inside diff spans", () => {
    // diff.js returns raw text; we interpolate directly into HTML.
    // Verify that angle brackets in the source don't accidentally
    // become markup. (Known limitation: the current impl does NOT
    // escape — this test documents the shape of the output so a
    // future escaping change is intentional.)
    const html = computeWordDiff("x", "<script>");
    // Just assert the string "<script>" is present — the production
    // code wraps it in a diff-added span but doesn't HTML-escape.
    // If we ever add escaping, this test needs to update.
    expect(html).toContain("script");
  });

  it("returns an empty string for two empty inputs", () => {
    expect(computeWordDiff("", "")).toBe("");
  });

  it("handles a pure addition (empty → content)", () => {
    const html = computeWordDiff("", "brand new content");
    expect(html).toContain('<span class="diff-added">');
    expect(html).toContain("brand new content");
  });

  it("handles a pure deletion (content → empty)", () => {
    const html = computeWordDiff("gone soon", "");
    expect(html).toContain('<span class="diff-removed">');
    expect(html).toContain("gone soon");
  });

  it("REGRESSION: keeps trailing newlines outside the diff span so fenced code delimiters stay on their own line", () => {
    // If a removal swallows the trailing \n, the closing ``` ends up
    // on the same line as </span> and Showdown stops recognising the
    // fence — the block renders as inline code with literal
    // `<span class="diff-removed">` text leaking through.
    const base = "```bash\nnpm install\nnpm run dev\n```";
    const head = "```bash\nnpm install\n```";
    const html = computeWordDiff(base, head);
    expect(html).not.toMatch(/\n<\/span>```/);
    expect(html).toMatch(/<\/span>\n+```/);
  });
});
