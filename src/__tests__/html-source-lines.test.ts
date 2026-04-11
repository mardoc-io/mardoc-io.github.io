/**
 * Tests for the HTML source-line attribute injector.
 *
 * This is the foundation of feature 033 (inline comments on HTML
 * files). Before we can tell an iframe-sandboxed HTML document "tell
 * me what line the user selected," we need every element to know
 * what line it came from in the source. The injector walks the HTML
 * source string and adds a `data-mardoc-line="N"` attribute to every
 * element, where N is the 1-indexed line where its opening tag
 * appears in the source.
 *
 * When a reviewer selects text in the rendered HTML, an injected
 * iframe script walks up from the selection's container to the
 * nearest ancestor with `data-mardoc-line` and postMessages that
 * line number back to the parent, where it flows into the same
 * comment-submission pipeline that markdown uses.
 *
 * These tests pin down the contract so the injector stays correct
 * as the surface area grows. Every test is a specific invariant the
 * HTML review flow depends on.
 */
import { describe, it, expect } from "vitest";
import { injectSourceLineAttributes } from "@/lib/html-source-lines";

describe("injectSourceLineAttributes — trivial", () => {
  it("returns empty string for empty input", () => {
    expect(injectSourceLineAttributes("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(injectSourceLineAttributes("hello world")).toBe("hello world");
  });

  it("returns a string with no tags unchanged", () => {
    const src = "line 1\nline 2\nline 3";
    expect(injectSourceLineAttributes(src)).toBe(src);
  });
});

describe("injectSourceLineAttributes — single element", () => {
  it("tags a single-line element with its source line", () => {
    const out = injectSourceLineAttributes("<p>hello</p>");
    expect(out).toContain('data-mardoc-line="1"');
    expect(out).toContain("<p");
    expect(out).toContain(">hello</p>");
  });

  it("tags an element on line 3", () => {
    const src = "\n\n<p>hello</p>";
    const out = injectSourceLineAttributes(src);
    expect(out).toMatch(/<p[^>]*data-mardoc-line="3"/);
  });

  it("preserves existing attributes", () => {
    const out = injectSourceLineAttributes('<div class="foo" id="bar">x</div>');
    expect(out).toContain('class="foo"');
    expect(out).toContain('id="bar"');
    expect(out).toContain('data-mardoc-line="1"');
  });

  it("does not add a duplicate attribute if one is already present", () => {
    const src = '<p data-mardoc-line="99">already tagged</p>';
    const out = injectSourceLineAttributes(src);
    // Only one data-mardoc-line attribute on this element
    const matches = out.match(/data-mardoc-line=/g) || [];
    expect(matches.length).toBe(1);
    // And the original value wasn't clobbered
    expect(out).toContain('data-mardoc-line="99"');
  });
});

describe("injectSourceLineAttributes — multiple elements", () => {
  it("tags each of two consecutive elements with its own line", () => {
    const src = "<h1>Title</h1>\n<p>Body</p>";
    const out = injectSourceLineAttributes(src);
    expect(out).toMatch(/<h1[^>]*data-mardoc-line="1"/);
    expect(out).toMatch(/<p[^>]*data-mardoc-line="2"/);
  });

  it("tags nested elements with their own opening-tag lines", () => {
    const src = "<div>\n  <p>inner</p>\n</div>";
    const out = injectSourceLineAttributes(src);
    expect(out).toMatch(/<div[^>]*data-mardoc-line="1"/);
    expect(out).toMatch(/<p[^>]*data-mardoc-line="2"/);
  });

  it("tags elements in a realistic document", () => {
    const src = [
      "<!DOCTYPE html>",
      "<html>",
      "<head>",
      "  <title>Report</title>",
      "</head>",
      "<body>",
      "  <h1>Findings</h1>",
      "  <p>The system behaved as expected.</p>",
      "  <ul>",
      "    <li>Item one</li>",
      "    <li>Item two</li>",
      "  </ul>",
      "</body>",
      "</html>",
    ].join("\n");
    const out = injectSourceLineAttributes(src);
    // html on line 2
    expect(out).toMatch(/<html[^>]*data-mardoc-line="2"/);
    // head on line 3
    expect(out).toMatch(/<head[^>]*data-mardoc-line="3"/);
    // title on line 4
    expect(out).toMatch(/<title[^>]*data-mardoc-line="4"/);
    // h1 on line 7
    expect(out).toMatch(/<h1[^>]*data-mardoc-line="7"/);
    // p on line 8
    expect(out).toMatch(/<p[^>]*data-mardoc-line="8"/);
    // first li on line 10
    expect(out).toMatch(/<li[^>]*data-mardoc-line="10"[^>]*>Item one/);
    // second li on line 11
    expect(out).toMatch(/<li[^>]*data-mardoc-line="11"[^>]*>Item two/);
  });
});

describe("injectSourceLineAttributes — void / self-closing elements", () => {
  it("tags a void element like <br>", () => {
    const src = "first<br>\nsecond";
    const out = injectSourceLineAttributes(src);
    expect(out).toMatch(/<br[^>]*data-mardoc-line="1"/);
  });

  it("tags a self-closing element like <br/> without breaking it", () => {
    const out = injectSourceLineAttributes("<p>a<br/>b</p>");
    // The br element still closes correctly; the p still tags as line 1
    expect(out).toMatch(/<br[^>]*data-mardoc-line="1"[^>]*\/>/);
    expect(out).toMatch(/<p[^>]*data-mardoc-line="1"/);
  });

  it("tags <img src=...> with its source line", () => {
    const out = injectSourceLineAttributes('<img src="x.png" alt="x">');
    expect(out).toContain('src="x.png"');
    expect(out).toContain('alt="x"');
    expect(out).toContain('data-mardoc-line="1"');
  });
});

describe("injectSourceLineAttributes — skip regions", () => {
  it("does NOT inject inside HTML comments", () => {
    const out = injectSourceLineAttributes("<!-- <p>hidden</p> -->\n<p>real</p>");
    // The commented-out <p> should NOT be tagged
    const commentMatches =
      (out.match(/<!--[\s\S]*?-->/g) || []).join("");
    expect(commentMatches).not.toContain("data-mardoc-line");
    // The real <p> on line 2 should be tagged
    expect(out).toMatch(/<p[^>]*data-mardoc-line="2"/);
  });

  it("does NOT inject inside <script> tag content", () => {
    const src = [
      "<script>",
      'var html = "<p>not real</p>";',
      "</script>",
      "<p>real</p>",
    ].join("\n");
    const out = injectSourceLineAttributes(src);
    // The <script> itself is tagged
    expect(out).toMatch(/<script[^>]*data-mardoc-line="1"/);
    // The <p> on line 4 is tagged
    expect(out).toMatch(/<p[^>]*data-mardoc-line="4"/);
    // The <p> inside the script string is NOT tagged
    const scriptBody = out.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    expect(scriptBody).not.toBeNull();
    expect(scriptBody![1]).not.toContain("data-mardoc-line");
  });

  it("does NOT inject inside <style> tag content", () => {
    const src = [
      "<style>",
      "p::before { content: '<p>'; }",
      "</style>",
      "<p>real</p>",
    ].join("\n");
    const out = injectSourceLineAttributes(src);
    expect(out).toMatch(/<style[^>]*data-mardoc-line="1"/);
    expect(out).toMatch(/<p[^>]*data-mardoc-line="4"/);
    const styleBody = out.match(/<style[^>]*>([\s\S]*?)<\/style>/);
    expect(styleBody).not.toBeNull();
    expect(styleBody![1]).not.toContain("data-mardoc-line");
  });

  it("does NOT inject inside the DOCTYPE declaration", () => {
    const out = injectSourceLineAttributes("<!DOCTYPE html>\n<html></html>");
    // The DOCTYPE is untouched
    expect(out).toContain("<!DOCTYPE html>");
    // The html on line 2 is tagged
    expect(out).toMatch(/<html[^>]*data-mardoc-line="2"/);
  });
});

describe("injectSourceLineAttributes — attribute-value edge cases", () => {
  it("does not break on attributes containing > inside quotes", () => {
    const src = '<a title="1 > 0">link</a>';
    const out = injectSourceLineAttributes(src);
    expect(out).toContain('title="1 > 0"');
    expect(out).toContain('data-mardoc-line="1"');
    // The tag is not prematurely closed
    expect(out).toContain("link</a>");
  });

  it("does not break on attributes containing newlines", () => {
    const src = '<div\n  class="foo"\n  id="bar">x</div>';
    const out = injectSourceLineAttributes(src);
    // The tag started on line 1 — that's what gets reported
    expect(out).toMatch(/data-mardoc-line="1"/);
    expect(out).toContain('class="foo"');
    expect(out).toContain('id="bar"');
  });

  it("preserves the closing > character", () => {
    const out = injectSourceLineAttributes("<p>x</p>");
    // The injection should not eat or duplicate the closing >
    const opens = (out.match(/<p[^>]*>/g) || []).length;
    expect(opens).toBe(1);
  });
});

describe("injectSourceLineAttributes — round trip", () => {
  it("the injected HTML still parses as the same DOM shape", () => {
    const src = "<div><h1>A</h1><p>B</p></div>";
    const out = injectSourceLineAttributes(src);
    // Strip all data-mardoc-line attrs and confirm we get the
    // original back. Whitespace is preserved byte-for-byte except
    // for the injected attribute.
    const stripped = out.replace(/\s*data-mardoc-line="\d+"/g, "");
    expect(stripped).toBe(src);
  });

  it("preserves every non-attribute byte in the source", () => {
    const src = "<html>\n  <body>\n    <p>hello\nworld</p>\n  </body>\n</html>\n";
    const out = injectSourceLineAttributes(src);
    const stripped = out.replace(/\s*data-mardoc-line="\d+"/g, "");
    expect(stripped).toBe(src);
  });
});
