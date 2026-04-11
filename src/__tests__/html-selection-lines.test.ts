/**
 * Tests for resolving a selection inside a rendered HTML document
 * back to a source line range.
 *
 * Contract:
 *
 *   1. The HTML has been pre-processed with
 *      `injectSourceLineAttributes` so every element carries a
 *      `data-mardoc-line="N"` attribute.
 *   2. The user selects text inside the iframe. The anchor and
 *      focus nodes of `window.getSelection()` may be text nodes.
 *   3. `resolveSelectionSourceLines(anchor, focus)` walks up each
 *      endpoint to the nearest ancestor element with a
 *      `data-mardoc-line` attribute and returns the minimum and
 *      maximum source lines.
 *
 * When the iframe script calls this function on the current
 * selection and posts the result back to the parent, the parent
 * drops the range directly into the comment submission pipeline
 * — same shape `mapSelectionToLines` produces for markdown.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resolveSelectionSourceLines } from "@/lib/html-selection";
import { injectSourceLineAttributes } from "@/lib/html-source-lines";

function setBody(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe("resolveSelectionSourceLines — element endpoints", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns the line of a single tagged element", () => {
    setBody('<p data-mardoc-line="5">hello</p>');
    const p = document.querySelector("p")!;
    expect(resolveSelectionSourceLines(p, p)).toEqual({
      startLine: 5,
      endLine: 5,
    });
  });

  it("returns the range spanning two sibling elements", () => {
    setBody(
      '<h1 data-mardoc-line="3">Title</h1>' +
        '<p data-mardoc-line="4">Body</p>'
    );
    const h1 = document.querySelector("h1")!;
    const p = document.querySelector("p")!;
    expect(resolveSelectionSourceLines(h1, p)).toEqual({
      startLine: 3,
      endLine: 4,
    });
  });

  it("returns the range regardless of endpoint order (focus before anchor)", () => {
    setBody(
      '<h1 data-mardoc-line="3">Title</h1>' +
        '<p data-mardoc-line="7">Body</p>'
    );
    const h1 = document.querySelector("h1")!;
    const p = document.querySelector("p")!;
    // Anchor at p (line 7), focus at h1 (line 3) — still {3,7}
    expect(resolveSelectionSourceLines(p, h1)).toEqual({
      startLine: 3,
      endLine: 7,
    });
  });
});

describe("resolveSelectionSourceLines — text-node endpoints", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("walks up from a text node to its parent element's line", () => {
    setBody('<p data-mardoc-line="10">hello world</p>');
    const textNode = document.querySelector("p")!.firstChild!;
    expect(textNode.nodeType).toBe(Node.TEXT_NODE);
    expect(resolveSelectionSourceLines(textNode, textNode)).toEqual({
      startLine: 10,
      endLine: 10,
    });
  });

  it("walks up from a nested text node through an untagged inline element", () => {
    // The <strong> has no data-mardoc-line (inline injection could
    // miss it, or the user modified HTML). The walker must keep
    // going up until it finds a tagged ancestor.
    setBody('<p data-mardoc-line="4"><strong>bold</strong> rest</p>');
    const strong = document.querySelector("strong")!;
    const textNode = strong.firstChild!;
    expect(resolveSelectionSourceLines(textNode, textNode)).toEqual({
      startLine: 4,
      endLine: 4,
    });
  });
});

describe("resolveSelectionSourceLines — nested and multi-line", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns the child's line, not the container's, for a nested selection", () => {
    setBody(
      '<div data-mardoc-line="2">' +
        '<h1 data-mardoc-line="3">Title</h1>' +
        '<p data-mardoc-line="5">Body</p>' +
        "</div>"
    );
    const h1 = document.querySelector("h1")!;
    expect(resolveSelectionSourceLines(h1, h1)).toEqual({
      startLine: 3,
      endLine: 3,
    });
  });

  it("returns the range across children of a shared container", () => {
    setBody(
      '<div data-mardoc-line="2">' +
        '<h1 data-mardoc-line="3">Title</h1>' +
        '<p data-mardoc-line="5">Body</p>' +
        "</div>"
    );
    const h1 = document.querySelector("h1")!;
    const p = document.querySelector("p")!;
    expect(resolveSelectionSourceLines(h1, p)).toEqual({
      startLine: 3,
      endLine: 5,
    });
  });

  it("handles deeply nested text-node endpoints", () => {
    setBody(
      '<article data-mardoc-line="1">' +
        '<section data-mardoc-line="2">' +
        '<p data-mardoc-line="8">final paragraph</p>' +
        "</section>" +
        "</article>"
    );
    const text = document.querySelector("p")!.firstChild!;
    expect(resolveSelectionSourceLines(text, text)).toEqual({
      startLine: 8,
      endLine: 8,
    });
  });
});

describe("resolveSelectionSourceLines — end-to-end with injector", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("runs the injector on real HTML and resolves a selection on the result", () => {
    const htmlSource = [
      "<html>",
      "<body>",
      "<h1>Findings</h1>",
      "<p>The system behaved as expected.</p>",
      "<ul>",
      "<li>Item one</li>",
      "<li>Item two</li>",
      "</ul>",
      "</body>",
      "</html>",
    ].join("\n");

    const injected = injectSourceLineAttributes(htmlSource);
    document.body.innerHTML = injected;

    // Simulate selecting "Item two" on line 7
    const lis = document.querySelectorAll("li");
    expect(lis.length).toBe(2);
    const secondLi = lis[1];
    const textNode = secondLi.firstChild!;
    expect(resolveSelectionSourceLines(textNode, textNode)).toEqual({
      startLine: 7,
      endLine: 7,
    });
  });

  it("resolves a multi-element selection on injected HTML", () => {
    const htmlSource = [
      "<html>",
      "<body>",
      "<h1>Findings</h1>",
      "<p>Intro.</p>",
      "<p>Body.</p>",
      "<p>Closing.</p>",
      "</body>",
      "</html>",
    ].join("\n");
    const injected = injectSourceLineAttributes(htmlSource);
    document.body.innerHTML = injected;

    const paragraphs = document.querySelectorAll("p");
    const startText = paragraphs[0].firstChild!; // p on line 4
    const endText = paragraphs[2].firstChild!; // p on line 6
    expect(resolveSelectionSourceLines(startText, endText)).toEqual({
      startLine: 4,
      endLine: 6,
    });
  });
});

describe("resolveSelectionSourceLines — degraded input", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when no ancestor has a data-mardoc-line attribute", () => {
    // None of these elements are tagged (e.g. user-injected HTML
    // without running the injector). The resolver returns null so
    // the caller can surface a graceful fallback instead of
    // attributing the comment to the wrong line.
    setBody("<p>hello</p>");
    const p = document.querySelector("p")!;
    expect(resolveSelectionSourceLines(p, p)).toBeNull();
  });

  it("returns null for null endpoints", () => {
    expect(resolveSelectionSourceLines(null, null)).toBeNull();
  });
});
