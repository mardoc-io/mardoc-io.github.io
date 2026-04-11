/**
 * Tests for the word count + reading time helpers. Pure functions, tested
 * before implementation so the contract is defined by the tests and not the
 * code.
 *
 * Reading time uses a standard 200 words-per-minute, rounded up to the
 * nearest whole minute, with a floor of 1 minute for any non-empty content.
 */
import { describe, it, expect } from "vitest";
import { countWords, readingMinutes, analyzeMarkdown } from "@/lib/word-count";

describe("countWords", () => {
  // ─── Trivial ────────────────────────────────────────────────────────────

  it("returns 0 for empty input", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only input", () => {
    expect(countWords("   \n\t  \n")).toBe(0);
  });

  it("counts a single word", () => {
    expect(countWords("hello")).toBe(1);
  });

  it("counts multiple space-separated words", () => {
    expect(countWords("the quick brown fox")).toBe(4);
  });

  it("counts words separated by tabs and newlines", () => {
    expect(countWords("one\ttwo\nthree")).toBe(3);
  });

  // ─── Markdown syntax (the whole point) ─────────────────────────────────

  it("strips heading markers from word count", () => {
    // "# Heading" should count as 1 word (Heading), not 2.
    expect(countWords("# Heading")).toBe(1);
    expect(countWords("## A Longer Heading")).toBe(3);
  });

  it("strips bold and italic markers", () => {
    expect(countWords("**bold** word")).toBe(2);
    expect(countWords("_italic_ word")).toBe(2);
    expect(countWords("a **bold** b _italic_ c")).toBe(5);
  });

  it("strips inline code backticks but counts the content", () => {
    expect(countWords("use `foo.bar()` here")).toBe(3);
  });

  it("excludes fenced code block content entirely", () => {
    // Code blocks should not pad the word count — a README with a huge
    // code example shouldn't claim a 20-minute read.
    const md = "before\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\nafter";
    expect(countWords(md)).toBe(2); // "before" + "after"
  });

  it("excludes indented code blocks", () => {
    const md = "before\n\n    indented code\n    more code\n\nafter";
    expect(countWords(md)).toBe(2);
  });

  it("counts link text but not URLs", () => {
    expect(countWords("see [the docs](https://example.com/docs) here")).toBe(4);
  });

  it("ignores image alt text and URLs", () => {
    // Images are visual; their alt is a11y metadata, not prose.
    expect(countWords("before ![alt text](img.png) after")).toBe(2);
  });

  it("counts list items without the bullet", () => {
    const md = "- item one\n- item two\n- item three";
    expect(countWords(md)).toBe(6);
  });

  it("counts numbered list items without the numbers", () => {
    const md = "1. first item\n2. second item\n3. third item";
    expect(countWords(md)).toBe(6);
  });

  it("counts blockquote content", () => {
    expect(countWords("> quoted text here")).toBe(3);
  });

  it("strips horizontal rules", () => {
    expect(countWords("before\n\n---\n\nafter")).toBe(2);
  });

  it("counts table cell text without pipes or separators", () => {
    const md = "| col a | col b |\n| --- | --- |\n| foo | bar |";
    expect(countWords(md)).toBe(6);
  });

  it("counts URLs as one word when they appear in plain text", () => {
    // A plain-text URL is a single token. We don't try to parse it out.
    expect(countWords("visit https://example.com please")).toBe(3);
  });

  it("ignores HTML comments", () => {
    expect(countWords("before <!-- hidden --> after")).toBe(2);
  });

  it("counts text inside ordinary HTML tags", () => {
    expect(countWords("before <b>bold</b> after")).toBe(3);
  });

  // ─── Real documents ─────────────────────────────────────────────────────

  it("counts a realistic mixed document", () => {
    const md = [
      "# Introduction",
      "",
      "This is the **first** paragraph of the document.",
      "",
      "## Code example",
      "",
      "```ts",
      "const x = 42;",
      "```",
      "",
      "- bullet one",
      "- bullet two with [a link](https://example.com)",
    ].join("\n");
    // "Introduction" (1) + "This is the first paragraph of the document." (8)
    // + "Code example" (2) + "bullet one" (2) + "bullet two with a link" (5) = 18
    expect(countWords(md)).toBe(18);
  });
});

describe("readingMinutes", () => {
  it("returns 0 for 0 words", () => {
    expect(readingMinutes(0)).toBe(0);
  });

  it("returns 1 for any non-zero count below 200 words", () => {
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(50)).toBe(1);
    expect(readingMinutes(199)).toBe(1);
  });

  it("returns 1 for exactly 200 words", () => {
    expect(readingMinutes(200)).toBe(1);
  });

  it("rounds up at the first word over the 200wpm boundary", () => {
    expect(readingMinutes(201)).toBe(2);
  });

  it("rounds up for fractional minutes", () => {
    expect(readingMinutes(500)).toBe(3); // 2.5 → 3
    expect(readingMinutes(1000)).toBe(5);
  });

  it("handles large counts", () => {
    expect(readingMinutes(5000)).toBe(25);
  });
});

describe("analyzeMarkdown (convenience wrapper)", () => {
  it("returns both words and reading minutes in one call", () => {
    const md = "one two three four five six seven eight nine ten";
    expect(analyzeMarkdown(md)).toEqual({ words: 10, readingMinutes: 1 });
  });

  it("returns 0/0 for an empty document", () => {
    expect(analyzeMarkdown("")).toEqual({ words: 0, readingMinutes: 0 });
  });

  it("handles a longer document with code blocks and formatting", () => {
    const md = [
      "# Title",
      "",
      "Paragraph with **bold** and _italic_.",
      "",
      "```",
      "lots of code that should not count",
      "```",
    ].join("\n");
    // "Title" (1) + "Paragraph with bold and italic" (5) = 6 words
    const result = analyzeMarkdown(md);
    expect(result.words).toBe(6);
    expect(result.readingMinutes).toBe(1);
  });
});
