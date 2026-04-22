import { describe, it, expect } from "vitest";
import { highlightCodeBlocks } from "@/lib/highlight";

describe("highlightCodeBlocks", () => {
  it("applies hljs classes to a language-tagged code block", () => {
    const input = '<code class="language-python">import os</code>';
    const out = highlightCodeBlocks(input);
    expect(out).toContain("hljs");
    expect(out).toContain("hljs-keyword");
  });

  it("preserves diff-added markers across tokenization inside a code block", () => {
    // Showdown HTML-escapes inline spans inside fenced code, so that's
    // what this pass actually receives.
    const input =
      '<code class="language-python">from src.glue.transforms.&lt;span class="diff-added"&gt;otel.&lt;/span&gt;preprocess import filter_llm_calls</code>';
    const out = highlightCodeBlocks(input);

    // The diff marker should survive as a real span, not be leaked
    // into the highlighter as source tokens.
    expect(out).toContain('<span class="diff-added">');
    expect(out).not.toMatch(/hljs-string[^>]*>[^<]*diff-added/);

    // The surrounding code should still be highlighted.
    expect(out).toContain("hljs-keyword");

    // The diff content itself must still appear in order.
    const plain = out.replace(/<[^>]+>/g, "");
    expect(plain).toContain("from src.glue.transforms.otel.preprocess import filter_llm_calls");
  });

  it("preserves diff-removed markers inside a code block", () => {
    const input =
      '<code class="language-python">x = &lt;span class="diff-removed"&gt;1&lt;/span&gt;</code>';
    const out = highlightCodeBlocks(input);
    expect(out).toContain('<span class="diff-removed">');
  });

  it("handles a diff marker that crosses a token boundary", () => {
    // The marker spans the dot and part of an identifier — lowlight
    // would normally emit these as separate text nodes.
    const input =
      '<code class="language-python">foo.&lt;span class="diff-added"&gt;bar_baz&lt;/span&gt;()</code>';
    const out = highlightCodeBlocks(input);
    expect(out).toContain('<span class="diff-added">');
    const plain = out.replace(/<[^>]+>/g, "");
    expect(plain).toContain("foo.bar_baz()");
  });

  it("leaves code blocks without a language tag alone", () => {
    const input = '<code>plain text</code>';
    const out = highlightCodeBlocks(input);
    expect(out).toBe(input);
  });
});
