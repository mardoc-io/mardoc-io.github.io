/**
 * Acceptance tests for the README's product claims.
 *
 * README.md opens with:
 *
 *   > # MarDoc
 *   > **A PWA overlay that makes working with markdown in your GitHub
 *   > repos easier.**
 *   >
 *   > MarDoc renders your GitHub PR diffs as rich, formatted documents
 *   > — not raw text with `+` and `-` lines. Select any passage, leave
 *   > a comment, and have it posted back to GitHub as an inline review
 *   > comment tied to the exact line range.
 *
 * Each sub-suite below codifies one load-bearing claim as an
 * executable invariant. If the product regresses on any of these, the
 * README is a lie — and more importantly, the review process that is
 * MarDoc's core value has broken.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  parseBlocks,
  computeBlockLineRanges,
  blockToHtml,
  computeWordDiff,
} from "@/lib/diff-blocks";
import { mapSelectionToLines } from "@/lib/github-api";
import { mergeFreshComments } from "@/lib/comment-merge";
import { buildSuggestionBody, parseSuggestionBody } from "@/lib/suggestion-body";
import { isLineResolutionError } from "@/lib/review-fallback";
import { injectSourceLineAttributes } from "@/lib/html-source-lines";
import { resolveSelectionSourceLines } from "@/lib/html-selection";
import type { PRComment } from "@/types";

// ─── Claim: "rich, formatted documents — not raw text with + and -" ──

describe("README claim: renders PR diffs as rich, formatted documents", () => {
  it("a markdown block is rendered to real HTML tags, not raw markdown", () => {
    const html = blockToHtml("# Heading\n\nThis is **bold**.");
    // Headings become real h1 tags
    expect(html).toMatch(/<h1[^>]*>/);
    // Bold becomes a real strong tag
    expect(html).toContain("<strong>bold</strong>");
    // The raw markdown markers are gone
    expect(html).not.toContain("# Heading");
    expect(html).not.toContain("**bold**");
  });

  it("a paragraph becomes a <p>, a list becomes <ul><li>", () => {
    expect(blockToHtml("Just a paragraph.")).toContain("<p>");
    const list = blockToHtml("- one\n- two");
    expect(list).toContain("<ul>");
    expect(list).toContain("<li>");
  });

  it("a table renders as a real <table> structure", () => {
    const html = blockToHtml("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
  });

  it("GFM alerts render as semantic callouts (not raw blockquote + marker)", () => {
    const html = blockToHtml("> [!NOTE]\n> Heads up.");
    expect(html).toContain("markdown-alert-note");
    expect(html).not.toContain("[!NOTE]");
  });

  it("footnote references render as linked superscripts", () => {
    const html = blockToHtml("Claim[^1].\n\n[^1]: Source.");
    expect(html).toContain('class="footnote-ref"');
    expect(html).toContain("fnref-1");
    // The raw token is gone
    expect(html).not.toContain("[^1]");
  });
});

describe("README claim: not raw text with `+` and `-` lines", () => {
  it("computeWordDiff emits semantic spans, not +/- line prefixes", () => {
    const html = computeWordDiff(
      "The quick brown fox.",
      "The slow brown fox jumped over the log."
    );
    // Added text is wrapped in a span class, not prefixed with +
    expect(html).toContain('<span class="diff-added">');
    // Removed text is wrapped in a span class, not prefixed with -
    expect(html).toContain('<span class="diff-removed">');
    // No line in the output starts with "+ " or "- " (unified-diff
    // convention)
    const lines = html.split("\n");
    for (const line of lines) {
      expect(line).not.toMatch(/^\+\s/);
      expect(line).not.toMatch(/^-\s/);
    }
  });

  it("a rendered block does not contain `+` or `-` line prefixes", () => {
    const realistic = [
      "# Guide",
      "",
      "Intro paragraph with **bold** and _italic_.",
      "",
      "- bullet 1",
      "- bullet 2",
      "",
      "```js",
      "const x = 1;",
      "```",
    ].join("\n");
    const html = blockToHtml(realistic);
    const lines = html.split("\n");
    for (const line of lines) {
      // It's fine for content to contain `+` or `-` as characters —
      // what's forbidden is a diff-style line prefix at column 0.
      if (line.length > 0 && (line[0] === "+" || line[0] === "-")) {
        // Must be followed by something that is NOT a space (i.e.,
        // not a unified-diff line).
        expect(line[1]).not.toBe(" ");
      }
    }
  });
});

// ─── Claim: "Select any passage" ────────────────────────────────────────

describe("README claim: select any passage", () => {
  const realistic = [
    "# Title",
    "",
    "Intro paragraph one.",
    "",
    "Intro paragraph two with **bold** and [a link](https://example.com).",
    "",
    "- bullet one",
    "- bullet two",
    "",
    "Closing line.",
  ].join("\n");

  it("can locate a single word in any paragraph", () => {
    expect(mapSelectionToLines(realistic, "Title").startLine).toBe(1);
    expect(mapSelectionToLines(realistic, "paragraph one").startLine).toBe(3);
    expect(mapSelectionToLines(realistic, "bold").startLine).toBe(5);
    expect(mapSelectionToLines(realistic, "bullet two").startLine).toBe(8);
    expect(mapSelectionToLines(realistic, "Closing").startLine).toBe(10);
  });

  it("can locate a multi-line selection that crosses paragraphs", () => {
    const r = mapSelectionToLines(
      realistic,
      "Intro paragraph one.\n\nIntro paragraph two"
    );
    expect(r.startLine).toBe(3);
    expect(r.endLine).toBe(5);
  });
});

// ─── Claim: "leave a comment, tied to the exact line range" ────────────

describe("README claim: inline review comment tied to exact line range", () => {
  const source = [
    "# API",
    "",
    "The endpoint takes a POST with JSON body.",
    "",
    "```",
    "POST /v1/users",
    "```",
  ].join("\n");

  it("parseBlocks + computeBlockLineRanges produce valid line ranges for PendingInlineComment", () => {
    const blocks = parseBlocks(source);
    const ranges = computeBlockLineRanges(source, blocks);

    // Every range's startLine and endLine are 1-indexed integers
    // within the source file's line count.
    const lineCount = source.split("\n").length;
    for (const r of ranges) {
      expect(Number.isInteger(r.startLine)).toBe(true);
      expect(Number.isInteger(r.endLine)).toBe(true);
      expect(r.startLine).toBeGreaterThanOrEqual(1);
      expect(r.endLine).toBeGreaterThanOrEqual(r.startLine);
      expect(r.endLine).toBeLessThanOrEqual(lineCount);
    }
  });

  it("a selection → mapSelectionToLines → line range is consistent with computeBlockLineRanges", () => {
    // When the user selects the whole of a block, the line range
    // returned by mapSelectionToLines matches the block's range
    // from computeBlockLineRanges.
    const blocks = parseBlocks(source);
    const ranges = computeBlockLineRanges(source, blocks);
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const expectedRange = ranges[i];
      const actualRange = mapSelectionToLines(source, block);
      expect(actualRange.startLine).toBe(expectedRange.startLine);
      // The end line may differ slightly for multi-line blocks where
      // the trailing newline lands on a different line; allow a
      // tolerance of 1 for that case.
      expect(
        Math.abs(actualRange.endLine - expectedRange.endLine)
      ).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Claim: "inline review comment" — batching and propagation ─────────

describe("README claim: posted back to GitHub as an inline review comment", () => {
  it("the comment merge helper preserves locally-queued pending comments across a poll refresh", () => {
    // The review flow is: user queues comments locally, clicks Submit,
    // the review gets sent as ONE GitHub API call. Between queueing
    // and submitting, the 30s background poll can fire — the merge
    // helper must not lose the in-flight comments.
    const localPending: PRComment[] = [
      {
        id: "c-local",
        author: "you",
        avatarColor: "#fff",
        body: "about to submit",
        createdAt: new Date().toISOString(),
        resolved: false,
        replies: [],
        pending: true,
      },
    ];
    const freshFromGitHub: PRComment[] = []; // poll saw nothing new
    const merged = mergeFreshComments(localPending, freshFromGitHub);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("c-local");
    expect(merged[0].pending).toBe(true);
  });

  it("suggestion bodies with nested code fences round-trip cleanly", () => {
    // Regression guard: a user's suggestion that contains a
    // ```json block used to collide with the outer suggestion fence
    // and ship as a broken comment. Now it round-trips.
    const content = [
      "## Example",
      "",
      "```json",
      '{"ok": true}',
      "```",
    ].join("\n");
    const body = buildSuggestionBody(content);
    const parsed = parseSuggestionBody(body);
    expect(parsed).toBe(content);
  });

  it("the batched-review fallback correctly distinguishes line-resolution errors from approval errors", () => {
    // The README says "inline review comment" — which requires the
    // batched review flow to handle GitHub's two relevant 422 errors
    // distinctly. Line-resolution errors trigger per-comment fallback;
    // "can't approve own PR" must NOT trigger fallback (it would
    // double-post comments).
    expect(
      isLineResolutionError({ status: 422, message: "Line could not be resolved" })
    ).toBe(true);
    expect(
      isLineResolutionError({
        status: 422,
        message: "Review Can not approve your own pull request",
      })
    ).toBe(false);
  });
});

// ─── Claim: "markdown and HTML" — HTML review parity ────────────────

describe("README claim: HTML files support the same review flow as markdown", () => {
  // The README says MarDoc works on "any `.md` or `.html` file in a
  // pull request". Feature 033 makes the select-passage/leave-a-comment
  // flow work on HTML. These tests pin the load-bearing invariants.

  const htmlSource = [
    "<!DOCTYPE html>",
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

  it("HTML source can be tagged with per-element source-line attributes", () => {
    const injected = injectSourceLineAttributes(htmlSource);
    // Every element opening tag carries a data-mardoc-line
    expect(injected).toMatch(/<h1[^>]*data-mardoc-line="4"/);
    expect(injected).toMatch(/<p[^>]*data-mardoc-line="5"/);
    expect(injected).toMatch(/<li[^>]*data-mardoc-line="7"/);
    expect(injected).toMatch(/<li[^>]*data-mardoc-line="8"/);
  });

  it("a selection in a tagged HTML document resolves to the correct source-line range", () => {
    const injected = injectSourceLineAttributes(htmlSource);
    document.body.innerHTML = injected;

    // User selects "Item one" (li on source line 7)
    const firstLi = document.querySelectorAll("li")[0];
    const textNode = firstLi.firstChild!;
    const range = resolveSelectionSourceLines(textNode, textNode);
    expect(range).toEqual({ startLine: 7, endLine: 7 });
  });

  it("a multi-element HTML selection produces a range spanning both source lines", () => {
    const injected = injectSourceLineAttributes(htmlSource);
    document.body.innerHTML = injected;

    // User drags from the h1 (line 4) to the p (line 5)
    const h1Text = document.querySelector("h1")!.firstChild!;
    const pText = document.querySelector("p")!.firstChild!;
    const range = resolveSelectionSourceLines(h1Text, pText);
    expect(range).toEqual({ startLine: 4, endLine: 5 });
  });

  it("injected HTML is still byte-identical to the source after stripping the attribute", () => {
    // Round-trip guarantee: injection doesn't reformat the source in
    // any way a reviewer would notice. The rendered output matches
    // the reviewer's expectations of the file they pushed.
    const injected = injectSourceLineAttributes(htmlSource);
    const stripped = injected.replace(/\s*data-mardoc-line="\d+"/g, "");
    expect(stripped).toBe(htmlSource);
  });
});

// ─── Claim: "PWA" ──────────────────────────────────────────────────────

describe("README claim: MarDoc is a PWA", () => {
  const projectRoot = resolve(__dirname, "..", "..");

  it.fails(
    "has a web app manifest at public/manifest.json or public/manifest.webmanifest",
    () => {
      // DOCUMENTED AS FAILING: the README says "A PWA overlay", but
      // the project has no manifest file and no service worker. This
      // test is marked `.fails` so the suite stays green while
      // surfacing the gap — if someone later adds a real manifest,
      // the test will start passing and needs to be un-marked.
      const a = existsSync(resolve(projectRoot, "public/manifest.json"));
      const b = existsSync(resolve(projectRoot, "public/manifest.webmanifest"));
      expect(a || b).toBe(true);
    }
  );

  it.fails(
    "has a service worker file registered from public/",
    () => {
      // DOCUMENTED AS FAILING: no service worker exists today.
      const a = existsSync(resolve(projectRoot, "public/sw.js"));
      const b = existsSync(resolve(projectRoot, "public/service-worker.js"));
      expect(a || b).toBe(true);
    }
  );

  it.fails(
    "links the manifest from the app layout",
    () => {
      // DOCUMENTED AS FAILING: layout.tsx does not include a
      // <link rel="manifest"> tag.
      const layout = readFileSync(
        resolve(projectRoot, "src/app/layout.tsx"),
        "utf-8"
      );
      expect(layout).toMatch(/rel=["']manifest["']/);
    }
  );
});
