/**
 * Tests for outline / TOC extraction. Pure markdown → heading list.
 *
 * Supports ATX headings (# Heading 1, ## Heading 2, …), excludes
 * headings that appear inside fenced code blocks, and emits a slug
 * compatible with GitHub's anchor link convention.
 */
import { describe, it, expect } from "vitest";
import {
  extractHeadings,
  slugifyHeading,
  type OutlineHeading,
} from "@/lib/outline";

describe("slugifyHeading", () => {
  it("lowercases ASCII letters", () => {
    expect(slugifyHeading("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugifyHeading("my heading title")).toBe("my-heading-title");
  });

  it("strips punctuation", () => {
    expect(slugifyHeading("Hello, World!")).toBe("hello-world");
    expect(slugifyHeading("What's new?")).toBe("whats-new");
  });

  it("collapses repeated hyphens", () => {
    expect(slugifyHeading("a - b - c")).toBe("a-b-c");
    expect(slugifyHeading("foo --- bar")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugifyHeading("-leading")).toBe("leading");
    expect(slugifyHeading("trailing-")).toBe("trailing");
    expect(slugifyHeading("---both---")).toBe("both");
  });

  it("preserves numbers", () => {
    expect(slugifyHeading("Step 1: Install")).toBe("step-1-install");
  });

  it("returns empty string for empty or whitespace-only input", () => {
    expect(slugifyHeading("")).toBe("");
    expect(slugifyHeading("   ")).toBe("");
  });

  it("strips inline markdown (bold, italic, code) from headings", () => {
    expect(slugifyHeading("**Hello** _world_")).toBe("hello-world");
    expect(slugifyHeading("Use `foo.bar()` here")).toBe("use-foobar-here");
  });

  it("handles emoji (drops them)", () => {
    // GitHub keeps emoji in some contexts, but for our anchor-link case
    // dropping them keeps the slug URL-safe and predictable.
    expect(slugifyHeading("🚀 launch day")).toBe("launch-day");
  });
});

describe("extractHeadings", () => {
  // ─── Trivial ────────────────────────────────────────────────────────────

  it("returns empty for empty input", () => {
    expect(extractHeadings("")).toEqual([]);
  });

  it("returns empty for a document with no headings", () => {
    expect(extractHeadings("just a paragraph\n\nanother one")).toEqual([]);
  });

  // ─── ATX headings ───────────────────────────────────────────────────────

  it("extracts a single ATX heading", () => {
    const out = extractHeadings("# Hello");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      level: 1,
      text: "Hello",
      slug: "hello",
      line: 1,
    });
  });

  it("extracts H1 through H6", () => {
    const md = "# a\n## b\n### c\n#### d\n##### e\n###### f";
    const out = extractHeadings(md);
    expect(out).toHaveLength(6);
    expect(out.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.map((h) => h.text)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("does not extract seven or more hashes", () => {
    // `####### notahead` is seven hashes — not a valid ATX heading.
    expect(extractHeadings("####### seven")).toEqual([]);
  });

  it("requires a space between the # and the text", () => {
    // `#Heading` (no space) is not a valid ATX heading.
    expect(extractHeadings("#NoSpace")).toEqual([]);
  });

  it("captures line numbers (1-indexed)", () => {
    const md = "paragraph\n\n# Heading\n\nmore text\n\n## Subheading";
    const out = extractHeadings(md);
    expect(out).toHaveLength(2);
    expect(out[0].line).toBe(3);
    expect(out[1].line).toBe(7);
  });

  it("ignores headings inside fenced code blocks", () => {
    const md = [
      "# Real",
      "",
      "```",
      "# not a heading",
      "## also not a heading",
      "```",
      "",
      "## Real subheading",
    ].join("\n");
    const out = extractHeadings(md);
    expect(out).toHaveLength(2);
    expect(out.map((h) => h.text)).toEqual(["Real", "Real subheading"]);
  });

  it("handles variable-length fences correctly", () => {
    // Outer fence of 4 backticks can contain a 3-backtick inner block —
    // neither fence should fool the heading parser.
    const md = [
      "````",
      "# inside outer fence",
      "```",
      "## still inside",
      "```",
      "````",
      "",
      "# real",
    ].join("\n");
    const out = extractHeadings(md);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("real");
  });

  it("strips trailing hashes from ATX closers (`# title #`)", () => {
    // CommonMark allows `# title #` — trailing hashes are decoration.
    expect(extractHeadings("# Title #")[0].text).toBe("Title");
    expect(extractHeadings("## Title ##")[0].text).toBe("Title");
  });

  it("strips inline markdown in heading text but keeps it for slugify input", () => {
    const out = extractHeadings("# Hello **world**");
    expect(out[0].text).toBe("Hello world");
    expect(out[0].slug).toBe("hello-world");
  });

  // ─── Multiple headings ──────────────────────────────────────────────────

  it("preserves source order across a realistic document", () => {
    const md = [
      "# Introduction",
      "",
      "paragraph",
      "",
      "## Background",
      "",
      "## Prior art",
      "",
      "# Approach",
      "",
      "### Step 1",
      "",
      "### Step 2",
    ].join("\n");
    const out = extractHeadings(md);
    expect(out.map((h) => h.text)).toEqual([
      "Introduction",
      "Background",
      "Prior art",
      "Approach",
      "Step 1",
      "Step 2",
    ]);
    expect(out.map((h) => h.level)).toEqual([1, 2, 2, 1, 3, 3]);
  });

  it("dedupes identical slugs by appending -1, -2, etc.", () => {
    // GitHub's anchor scheme handles duplicate headings by suffixing.
    const md = "# Intro\n\n## Details\n\n# Intro\n\n## Details";
    const out = extractHeadings(md);
    expect(out.map((h) => h.slug)).toEqual([
      "intro",
      "details",
      "intro-1",
      "details-1",
    ]);
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────

  it("does not extract `>` blockquoted headings", () => {
    // `> # quoted` is a blockquote containing a heading. For outline
    // purposes, skip it — it's not a top-level section.
    expect(extractHeadings("> # quoted\n\n# real")).toHaveLength(1);
    expect(extractHeadings("> # quoted\n\n# real")[0].text).toBe("real");
  });

  it("does not extract headings preceded by text on the same line", () => {
    // `text # not a heading` — hash must be at the start of the line.
    expect(extractHeadings("paragraph # not")).toEqual([]);
  });

  it("handles leading whitespace (up to 3 spaces per CommonMark)", () => {
    // 0-3 leading spaces → still a heading.
    expect(extractHeadings("   # indented")).toHaveLength(1);
    // 4+ leading spaces → indented code block, not a heading.
    expect(extractHeadings("    # indented-code")).toEqual([]);
  });
});
