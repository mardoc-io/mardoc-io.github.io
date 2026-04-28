/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { injectCommentHighlights } from "@/lib/highlight-comments";

describe("injectCommentHighlights", () => {
  it("wraps matching text in a <mark> tag", () => {
    const html = "<p>The quick brown fox.</p>";
    const result = injectCommentHighlights(html, [
      { selectedText: "quick brown", commentId: "c1" },
    ]);
    expect(result).toContain('<mark class="selection-comment-highlight" data-comment-id="c1">quick brown</mark>');
  });

  it("returns original html when no comments", () => {
    const html = "<p>Hello world</p>";
    expect(injectCommentHighlights(html, [])).toBe(html);
  });

  it("does not match inside HTML attributes", () => {
    const html = '<a href="getting-started">Getting Started</a>';
    const result = injectCommentHighlights(html, [
      { selectedText: "getting-started", commentId: "c1" },
    ]);
    // Should NOT inject a mark inside the href attribute
    expect(result).not.toContain('data-comment-id="c1"');
  });

  it("matches text that spans across inline tags", () => {
    const html = "<p><strong>bold</strong> text here</p>";
    const result = injectCommentHighlights(html, [
      { selectedText: "bold text", commentId: "c1" },
    ]);
    expect(result).toContain('data-comment-id="c1"');
    expect(result).toContain("bold");
    expect(result).toContain("text");
  });

  it("handles HTML entities in text content", () => {
    const html = "<p>Tom &amp; Jerry</p>";
    const result = injectCommentHighlights(html, [
      { selectedText: "Tom & Jerry", commentId: "c1" },
    ]);
    expect(result).toContain('data-comment-id="c1"');
  });

  it("highlights multiple non-overlapping comments", () => {
    const html = "<p>First comment target. Second comment target.</p>";
    const result = injectCommentHighlights(html, [
      { selectedText: "First comment", commentId: "c1" },
      { selectedText: "Second comment", commentId: "c2" },
    ]);
    expect(result).toContain('data-comment-id="c1"');
    expect(result).toContain('data-comment-id="c2"');
  });

  it("skips comments with empty selectedText", () => {
    const html = "<p>Hello</p>";
    const result = injectCommentHighlights(html, [
      { selectedText: "", commentId: "c1" },
    ]);
    expect(result).toBe(html);
  });

  it("does not break when selectedText is not found", () => {
    const html = "<p>Hello world</p>";
    const result = injectCommentHighlights(html, [
      { selectedText: "not in this text", commentId: "c1" },
    ]);
    expect(result).toBe(html);
  });
});
