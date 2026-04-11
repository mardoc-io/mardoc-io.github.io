/**
 * Tests for the GitHub Alerts transformation. Pure function that takes
 * already-rendered HTML (from Showdown) and rewrites GitHub-style alert
 * blockquotes into semantic <div class="markdown-alert markdown-alert-*"> blocks.
 *
 * GitHub renders special blockquotes with a > [!TYPE] marker as colored
 * callouts with an icon and a title. Showdown has no native support, so we
 * post-process its output. Showdown turns:
 *
 *    > [!NOTE]
 *    > This is a note.
 *
 * into
 *
 *    <blockquote>
 *      <p>[!NOTE]
 *      This is a note.</p>
 *    </blockquote>
 *
 * and this transformer rewrites that into
 *
 *    <div class="markdown-alert markdown-alert-note">
 *      <p class="markdown-alert-title">Note</p>
 *      <p>This is a note.</p>
 *    </div>
 *
 * Non-alert blockquotes pass through unchanged.
 */
import { describe, it, expect } from "vitest";
import Showdown from "showdown";
import { transformGitHubAlerts } from "@/lib/github-alerts";

function md2alerts(md: string): string {
  const sd = new Showdown.Converter({
    tables: true,
    strikethrough: true,
    ghCodeBlocks: true,
  });
  return transformGitHubAlerts(sd.makeHtml(md));
}

describe("transformGitHubAlerts", () => {
  // ─── All five alert types ───────────────────────────────────────────────

  it("transforms a NOTE alert", () => {
    const html = md2alerts("> [!NOTE]\n> This is a note.");
    expect(html).toContain('class="markdown-alert markdown-alert-note"');
    expect(html).toContain('class="markdown-alert-title">Note</p>');
    expect(html).toContain("This is a note.");
    expect(html).not.toContain("[!NOTE]");
    expect(html).not.toContain("<blockquote>");
  });

  it("transforms a TIP alert", () => {
    const html = md2alerts("> [!TIP]\n> Helpful hint.");
    expect(html).toContain("markdown-alert-tip");
    expect(html).toContain(">Tip</p>");
    expect(html).toContain("Helpful hint.");
  });

  it("transforms an IMPORTANT alert", () => {
    const html = md2alerts("> [!IMPORTANT]\n> Read carefully.");
    expect(html).toContain("markdown-alert-important");
    expect(html).toContain(">Important</p>");
    expect(html).toContain("Read carefully.");
  });

  it("transforms a WARNING alert", () => {
    const html = md2alerts("> [!WARNING]\n> Be careful.");
    expect(html).toContain("markdown-alert-warning");
    expect(html).toContain(">Warning</p>");
    expect(html).toContain("Be careful.");
  });

  it("transforms a CAUTION alert", () => {
    const html = md2alerts("> [!CAUTION]\n> Destructive action.");
    expect(html).toContain("markdown-alert-caution");
    expect(html).toContain(">Caution</p>");
    expect(html).toContain("Destructive action.");
  });

  // ─── Body shapes ────────────────────────────────────────────────────────

  it("handles multi-line body in one paragraph", () => {
    const html = md2alerts("> [!WARNING]\n> Line 1.\n> Line 2.\n> Line 3.");
    expect(html).toContain("Line 1.");
    expect(html).toContain("Line 2.");
    expect(html).toContain("Line 3.");
    // All three lines collapse into a single <p> because there's no blank
    // line separating them.
    const bodyPCount = (html.match(/<p>Line/g) || []).length;
    expect(bodyPCount).toBeLessThanOrEqual(1);
  });

  it("handles multi-paragraph body", () => {
    const html = md2alerts("> [!CAUTION]\n> First paragraph.\n>\n> Second paragraph.");
    expect(html).toContain("First paragraph.");
    expect(html).toContain("Second paragraph.");
    // Second paragraph gets its own <p> because of the blank blockquote line.
    expect(html).toMatch(/<p[^>]*>First paragraph\.<\/p>\s*<p>Second paragraph\.<\/p>/);
  });

  it("preserves inline formatting (bold, italic, links) inside alerts", () => {
    const html = md2alerts("> [!TIP]\n> Use **bold** and _italic_ and [a link](https://example.com).");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("a link");
  });

  it("preserves inline code inside alerts", () => {
    const html = md2alerts("> [!NOTE]\n> Run `npm test` before shipping.");
    expect(html).toContain("<code>npm test</code>");
  });

  it("handles alert with text on the marker line", () => {
    // Some users write `> [!NOTE] text here` instead of splitting across
    // lines. The GitHub parser accepts this; we should too.
    const html = md2alerts("> [!NOTE] Inline body text.");
    expect(html).toContain("markdown-alert-note");
    expect(html).toContain("Inline body text.");
    expect(html).not.toContain("[!NOTE]");
  });

  it("handles an alert with only a type marker and no body", () => {
    const html = md2alerts("> [!NOTE]");
    expect(html).toContain("markdown-alert-note");
    expect(html).toContain(">Note</p>");
    // Title-only is valid — renders as a bare callout with just the label.
    expect(html).not.toContain("[!NOTE]");
  });

  // ─── Case insensitivity ─────────────────────────────────────────────────

  it("accepts lowercase type markers", () => {
    const html = md2alerts("> [!note]\n> lowercase.");
    expect(html).toContain("markdown-alert-note");
    expect(html).toContain(">Note</p>");
  });

  it("accepts mixed case type markers", () => {
    const html = md2alerts("> [!Warning]\n> mixed case.");
    expect(html).toContain("markdown-alert-warning");
    expect(html).toContain(">Warning</p>");
  });

  // ─── Things that must pass through unchanged ──────────────────────────

  it("leaves an ordinary blockquote alone", () => {
    const html = md2alerts("> Just a quote.\n> Without an alert marker.");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("markdown-alert");
  });

  it("leaves a blockquote with an unknown marker alone", () => {
    // `[!CUSTOM]` isn't a real GitHub alert type — leave it as literal.
    const html = md2alerts("> [!CUSTOM]\n> body");
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("markdown-alert");
    expect(html).toContain("[!CUSTOM]");
  });

  it("leaves content outside blockquotes alone", () => {
    const html = md2alerts("# Heading\n\nParagraph with `[!NOTE]` in plain text.");
    // `[!NOTE]` inside inline code or a plain paragraph is NOT an alert.
    expect(html).not.toContain("markdown-alert");
    expect(html).toContain("<h1");
    expect(html).toContain("Paragraph with");
  });

  it("handles multiple alerts in the same document", () => {
    const md = [
      "> [!NOTE]",
      "> First alert.",
      "",
      "Regular paragraph.",
      "",
      "> [!WARNING]",
      "> Second alert.",
    ].join("\n");
    const html = md2alerts(md);
    expect(html).toContain("markdown-alert-note");
    expect(html).toContain("markdown-alert-warning");
    expect(html).toContain("First alert.");
    expect(html).toContain("Second alert.");
    expect(html).toContain("Regular paragraph.");
    // Neither alert should still have the bracket marker.
    expect(html).not.toContain("[!NOTE]");
    expect(html).not.toContain("[!WARNING]");
  });

  // ─── Idempotent ─────────────────────────────────────────────────────────

  it("is idempotent — running twice produces the same result", () => {
    const once = md2alerts("> [!NOTE]\n> idempotent");
    const twice = transformGitHubAlerts(once);
    expect(twice).toBe(once);
  });

  // ─── Empty input ────────────────────────────────────────────────────────

  it("returns empty string for empty input", () => {
    expect(transformGitHubAlerts("")).toBe("");
  });

  it("returns non-alert HTML unchanged", () => {
    const html = "<h1>Hello</h1><p>World</p>";
    expect(transformGitHubAlerts(html)).toBe(html);
  });
});
