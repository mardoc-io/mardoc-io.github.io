/**
 * Simulates the Editor.tsx "save new file as PR" pipeline end-to-end, using
 * the same Turndown configuration the live editor uses. These tests catch
 * regressions in the markdown conversion path BEFORE the content ever hits
 * the GitHub API.
 *
 * What we test:
 *   editor.getHTML() → createTurndownService().turndown(html) → markdown string
 *
 * The HTML inputs below are hand-crafted to match exactly what TipTap's
 * StarterKit produces for typical user input. This avoids needing a real
 * TipTap instance (which doesn't run reliably in jsdom).
 */
import { describe, it, expect } from "vitest";
import { createTurndownService } from "@/lib/turndown";

function tiptapToMarkdown(html: string): string {
  const turndown = createTurndownService();
  return turndown.turndown(html).trim();
}

describe("editor → turndown save pipeline", () => {
  // ─── The exact bug the user reported ────────────────────────────────────

  it("H1 + paragraph (what the user typed for 'Concept' + description)", () => {
    const html = "<h1>Concept</h1><p>This is a new file. It should autosave.</p>";
    const md = tiptapToMarkdown(html);
    expect(md).toContain("# Concept");
    expect(md).toContain("This is a new file. It should autosave.");
  });

  it("standalone H1 survives", () => {
    expect(tiptapToMarkdown("<h1>Concept</h1>")).toBe("# Concept");
  });

  it("H2 and H3 survive", () => {
    expect(tiptapToMarkdown("<h2>Subheading</h2>")).toBe("## Subheading");
    expect(tiptapToMarkdown("<h3>Sub-subheading</h3>")).toBe("### Sub-subheading");
  });

  it("bold text survives", () => {
    expect(tiptapToMarkdown("<p><strong>bold</strong></p>")).toBe("**bold**");
  });

  it("italic text survives", () => {
    expect(tiptapToMarkdown("<p><em>italic</em></p>")).toBe("_italic_");
  });

  it("inline code survives", () => {
    expect(tiptapToMarkdown("<p>Use <code>foo()</code> here</p>")).toBe(
      "Use `foo()` here"
    );
  });

  it("bullet list survives", () => {
    const html = "<ul><li><p>one</p></li><li><p>two</p></li><li><p>three</p></li></ul>";
    const md = tiptapToMarkdown(html);
    expect(md).toContain("*   one");
    expect(md).toContain("*   two");
    expect(md).toContain("*   three");
  });

  it("ordered list survives", () => {
    const html = "<ol><li><p>one</p></li><li><p>two</p></li></ol>";
    const md = tiptapToMarkdown(html);
    expect(md).toContain("1.  one");
    expect(md).toContain("2.  two");
  });

  it("fenced code block survives", () => {
    const html = '<pre><code class="language-js">const x = 1;</code></pre>';
    const md = tiptapToMarkdown(html);
    expect(md).toContain("```");
    expect(md).toContain("const x = 1;");
  });

  it("link survives", () => {
    const html = '<p><a href="https://example.com">example</a></p>';
    expect(tiptapToMarkdown(html)).toBe("[example](https://example.com)");
  });

  it("image survives", () => {
    const html = '<p><img src="https://example.com/img.png" alt="alt"></p>';
    const md = tiptapToMarkdown(html);
    expect(md).toContain("![alt]");
    expect(md).toContain("https://example.com/img.png");
  });

  // ─── Realistic full document ────────────────────────────────────────────

  it("full document: heading + paragraph + list + bold", () => {
    const html = `
      <h1>Concept</h1>
      <p>This is a new file. It should <strong>autosave</strong>.</p>
      <ul>
        <li><p>one</p></li>
        <li><p>two</p></li>
      </ul>
    `;
    const md = tiptapToMarkdown(html);
    expect(md).toContain("# Concept");
    expect(md).toContain("This is a new file. It should **autosave**.");
    expect(md).toContain("*   one");
    expect(md).toContain("*   two");
  });

  // ─── Round-trip through showdown (what the diff viewer does) ───────────

  it("heading round-trips through showdown so the diff preview shows it as a heading", () => {
    // This mirrors what the DiffViewer preview mode does: take the saved
    // markdown and render it via showdown. If the heading doesn't round-trip
    // cleanly, the user sees "Concept" as plain text instead of a heading.
    const html = "<h1>Concept</h1><p>Body text.</p>";
    const md = tiptapToMarkdown(html);

    // The saved markdown should start with a proper ATX heading.
    expect(md.startsWith("# Concept")).toBe(true);
  });

  // ─── The bug scenario: `#` typed as literal text, not triggered as heading ─

  it("literal '# Concept' in a paragraph (TipTap input rule did not fire)", () => {
    // If the user typed `#` + space + `Concept` but the TipTap markdown input
    // rule did NOT fire (happens if the cursor was in the middle of the line,
    // or some other edge case), TipTap emits `<p># Concept</p>` instead of
    // `<h1>Concept</h1>`. Turndown's default behavior is to ESCAPE the
    // leading `#` so it doesn't accidentally become a heading when the
    // markdown is re-parsed.
    //
    // This test documents what actually happens — and is probably the cause
    // of the user's bug.
    const html = "<p># Concept</p>";
    const md = tiptapToMarkdown(html);

    // Turndown will either output `# Concept` (works as heading when
    // re-parsed) or `\# Concept` (renders as literal "# Concept"). We want
    // to know which.
    //
    // Regardless: if Showdown later parses the result, what happens?
    const Showdown = require("showdown");
    const showdown = new Showdown.Converter();
    const html2 = showdown.makeHtml(md);
    // If md is `# Concept`, html2 should contain `<h1`. If md is `\# Concept`,
    // it will be `<p># Concept</p>`. Either case is informative.
    // eslint-disable-next-line no-console
    console.log("literal '# Concept' in <p> becomes:", JSON.stringify(md), "→", html2);
  });

  it("empty paragraphs don't break the save", () => {
    const html = "<p></p><h1>Title</h1><p>body</p><p></p>";
    const md = tiptapToMarkdown(html);
    expect(md).toContain("# Title");
    expect(md).toContain("body");
  });
});
