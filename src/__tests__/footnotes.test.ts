/**
 * Tests for footnote transformation. transformFootnotes is a PRE-processor
 * on the markdown source (not a post-processor on HTML like alerts) because
 * Showdown's own reference-link handling mangles `[^label]: body` — it
 * parses `[^a]` / `[^a]: First.` as a reference-link shortcut and emits
 * `<a href="First.">^a</a>`. Pre-processing strips definitions out before
 * Showdown ever sees them.
 *
 * Transformation rules:
 *   - Numbered in order of FIRST reference in the source
 *   - Definition bodies resolved once, even if referenced multiple times
 *   - Unreferenced definitions are dropped (not rendered)
 *   - References replaced inline with <sup><a href="#fn-N">N</a></sup>
 *   - A footnotes section is appended at the end with back-links
 */
import { describe, it, expect } from "vitest";
import Showdown from "showdown";
import { transformFootnotes } from "@/lib/footnotes";

function runThroughShowdown(md: string): string {
  const sd = new Showdown.Converter({ tables: true, strikethrough: true, ghCodeBlocks: true });
  return sd.makeHtml(transformFootnotes(md));
}

describe("transformFootnotes — pre-processor", () => {
  // ─── No-op cases ────────────────────────────────────────────────────────

  it("returns empty input unchanged", () => {
    expect(transformFootnotes("")).toBe("");
  });

  it("returns a document with no footnotes unchanged", () => {
    const md = "# Heading\n\nJust a paragraph. No footnotes.";
    expect(transformFootnotes(md)).toBe(md);
  });

  // ─── Reference replacement ─────────────────────────────────────────────

  it("replaces a single reference with a sup/anchor", () => {
    const md = "Paragraph[^1].\n\n[^1]: The body.";
    const out = transformFootnotes(md);
    expect(out).toContain('<sup class="footnote-ref"');
    expect(out).toContain('id="fnref-1"');
    expect(out).toContain('href="#fn-1"');
    expect(out).toContain(">1</a>");
    // The inline `[^1]` token must be gone.
    expect(out).not.toContain("[^1]");
  });

  it("numbers references in order of first appearance", () => {
    // "b" appears first in the text; "a" appears second. The numbering
    // must follow document order, not alphabetical or definition order.
    const md = "First ref[^b] then[^a].\n\n[^a]: A.\n[^b]: B.";
    const out = transformFootnotes(md);
    const bIdx = out.indexOf('id="fnref-1"');
    const aIdx = out.indexOf('id="fnref-2"');
    expect(bIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeGreaterThan(aIdx > -1 ? bIdx : -1);
    // Body "B." should be labelled 1, body "A." should be labelled 2.
    expect(out).toMatch(/id="fn-1"[\s\S]*B\./);
    expect(out).toMatch(/id="fn-2"[\s\S]*A\./);
  });

  it("numbers references starting from 1 per document", () => {
    const md = "x[^a] y[^b] z[^c].\n\n[^a]: 1.\n[^b]: 2.\n[^c]: 3.";
    const out = transformFootnotes(md);
    expect(out).toContain('id="fnref-1"');
    expect(out).toContain('id="fnref-2"');
    expect(out).toContain('id="fnref-3"');
  });

  it("reuses the same number for repeated references to the same label", () => {
    // `[^1]` appears twice in the body but has one definition — both
    // references should link to the same `#fn-1`.
    const md = "One[^1], two[^1].\n\n[^1]: Single def.";
    const out = transformFootnotes(md);
    const matches = out.match(/href="#fn-1"/g) || [];
    expect(matches.length).toBe(2);
    // Only one footnote body should appear.
    const bodyMatches = out.match(/id="fn-1"/g) || [];
    expect(bodyMatches.length).toBe(1);
  });

  // ─── Definition stripping ──────────────────────────────────────────────

  it("removes definition lines from the document body", () => {
    const md = "Paragraph[^1].\n\n[^1]: Body text.";
    const out = transformFootnotes(md);
    // The literal `[^1]: Body text.` string must NOT appear in the
    // prose area (it gets moved to the footnotes section with different
    // formatting).
    expect(out).not.toContain("[^1]: Body text.");
  });

  it("drops unreferenced definitions entirely", () => {
    const md = "Paragraph.\n\n[^orphan]: Unused body.";
    const out = transformFootnotes(md);
    expect(out).not.toContain("Unused body");
    expect(out).not.toContain("orphan");
    expect(out).not.toContain("footnote");
  });

  it("does not transform a reference with no matching definition", () => {
    // If there's no `[^missing]: ...` anywhere, leave the inline token
    // as literal text. This matches Pandoc's behavior.
    const md = "Paragraph [^missing] here.";
    const out = transformFootnotes(md);
    expect(out).toContain("[^missing]");
    expect(out).not.toContain("footnote-ref");
  });

  // ─── Footnotes section ────────────────────────────────────────────────

  it("appends a footnotes section at the end", () => {
    const md = "Paragraph[^1].\n\n[^1]: Body.";
    const out = transformFootnotes(md);
    expect(out).toContain('<section class="footnotes"');
    expect(out).toContain("<ol");
    expect(out).toContain('id="fn-1"');
    expect(out).toContain("Body");
  });

  it("each definition has a back-link to its reference", () => {
    const md = "Paragraph[^1].\n\n[^1]: Body.";
    const out = transformFootnotes(md);
    expect(out).toContain('href="#fnref-1"');
    expect(out).toContain("footnote-back");
  });

  it("omits the footnotes section when no references are resolved", () => {
    // The word "footnote" appears in the source, so we assert against the
    // HTML markers the transform would add — not the literal word.
    const md = "No footnotes here. Just text.";
    const out = transformFootnotes(md);
    expect(out).not.toContain("<section");
    expect(out).not.toContain("fnref-");
  });

  it("omits the footnotes section when every reference is missing its definition", () => {
    const md = "A [^one] B [^two] C.";
    const out = transformFootnotes(md);
    expect(out).not.toContain("<section");
    expect(out).not.toContain("fnref-");
  });

  // ─── Integration with Showdown ────────────────────────────────────────

  it("end-to-end through Showdown: references render as live links", () => {
    const md = "Paragraph[^1].\n\n[^1]: The body.";
    const html = runThroughShowdown(md);
    expect(html).toContain('<sup class="footnote-ref"');
    expect(html).toContain('href="#fn-1"');
    // The body "The body." should appear inside the footnotes section.
    expect(html).toContain("The body");
    // The inline `[^1]` literal must be gone.
    expect(html).not.toContain("[^1]");
  });

  it("end-to-end: two references with swapped alphabetical order", () => {
    // This is the case that mangled under raw Showdown (`<a href="First.">`).
    // Post-transform, it should be clean.
    const md = "Two refs[^a] and[^b].\n\n[^a]: First.\n[^b]: Second.";
    const html = runThroughShowdown(md);
    expect(html).toContain("First");
    expect(html).toContain("Second");
    // No bogus reference-link leaks.
    expect(html).not.toContain('href="First');
    expect(html).not.toContain('href="Second');
  });

  // ─── Edge cases ───────────────────────────────────────────────────────

  it("ignores `[^label]` inside fenced code blocks", () => {
    const md = [
      "Real ref[^1].",
      "",
      "```",
      "Code with [^1] literal.",
      "```",
      "",
      "[^1]: Body.",
    ].join("\n");
    const out = transformFootnotes(md);
    // The code-block literal should NOT have been transformed.
    expect(out).toContain("[^1] literal");
    // The real reference in the paragraph should be transformed.
    expect(out).toContain('id="fnref-1"');
  });

  it("allows alphanumeric + hyphen + underscore labels", () => {
    const md = "A[^foo-1] B[^bar_2] C[^baz3].\n\n[^foo-1]: 1\n[^bar_2]: 2\n[^baz3]: 3";
    const out = transformFootnotes(md);
    expect(out).toContain('id="fnref-1"');
    expect(out).toContain('id="fnref-2"');
    expect(out).toContain('id="fnref-3"');
  });

  it("handles inline formatting inside definition bodies", () => {
    const md = "x[^1].\n\n[^1]: Body with **bold** and _italic_.";
    const html = runThroughShowdown(md);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });
});
