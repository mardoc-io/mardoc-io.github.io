/**
 * HTML-in-Markdown round-trip fidelity tests.
 *
 * Pipeline: Markdown → Showdown → HTML → Turndown → Markdown
 *
 * Each test feeds markdown containing a specific HTML element through the
 * same Showdown/Turndown configuration used in Editor.tsx, then checks
 * whether the element survives the round-trip.
 *
 * Tests marked with `.fails` document known lossy conversions — the test
 * suite passes today and will start passing (and need updating) as we fix
 * each element.
 */
import { describe, it, expect } from "vitest";
import Showdown from "showdown";
import { createTurndownService } from "@/lib/turndown";

// Match Editor.tsx Showdown config
function createShowdown() {
  return new Showdown.Converter({
    tables: true,
    tasklists: true,
    strikethrough: true,
    ghCodeBlocks: true,
    simplifiedAutoLink: true,
    literalMidWordUnderscores: true,
    simpleLineBreaks: false,
    openLinksInNewWindow: true,
    emoji: true,
    ghCompatibleHeaderId: true,
  });
}

function roundTrip(markdown: string): string {
  const showdown = createShowdown();
  const turndown = createTurndownService();
  const html = showdown.makeHtml(markdown);
  return turndown.turndown(html).trim();
}

// Helper: check if the output contains a specific substring
function survives(markdown: string, needle: string): boolean {
  return roundTrip(markdown).includes(needle);
}

// ─── Standard Markdown (should always pass) ──────────────────────────────

describe("standard markdown round-trip", () => {
  it("preserves headings", () => {
    expect(roundTrip("# Heading 1")).toBe("# Heading 1");
    expect(roundTrip("## Heading 2")).toBe("## Heading 2");
    expect(roundTrip("### Heading 3")).toBe("### Heading 3");
  });

  it("preserves bold and italic", () => {
    expect(roundTrip("**bold**")).toBe("**bold**");
    expect(roundTrip("_italic_")).toBe("_italic_");
  });

  it("preserves inline code", () => {
    expect(roundTrip("`code`")).toBe("`code`");
  });

  it("preserves fenced code blocks", () => {
    const md = "```js\nconst x = 1;\n```";
    const result = roundTrip(md);
    expect(result).toContain("```");
    expect(result).toContain("const x = 1;");
  });

  it("preserves links", () => {
    const result = roundTrip("[link](https://example.com)");
    expect(result).toContain("[link]");
    expect(result).toContain("https://example.com");
  });

  it("preserves images", () => {
    const result = roundTrip("![alt](image.png)");
    expect(result).toContain("![alt]");
    expect(result).toContain("image.png");
  });

  it("preserves unordered lists", () => {
    const md = "- item 1\n- item 2\n- item 3";
    const result = roundTrip(md);
    expect(result).toContain("item 1");
    expect(result).toContain("item 2");
    expect(result).toContain("item 3");
  });

  it("preserves ordered lists", () => {
    const md = "1. first\n2. second\n3. third";
    const result = roundTrip(md);
    expect(result).toContain("first");
    expect(result).toContain("second");
  });

  it("preserves blockquotes", () => {
    expect(roundTrip("> quoted text")).toBe("> quoted text");
  });

  it("preserves horizontal rules", () => {
    const result = roundTrip("---");
    // Turndown converts to `* * *` by default — semantically equivalent
    expect(result).toMatch(/\* \* \*|---/);
  });

  it("preserves strikethrough", () => {
    // Turndown doesn't support GFM strikethrough without a plugin
    expect(roundTrip("~~deleted~~")).toBe("~~deleted~~");
  });

  it("preserves tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |";
    const result = roundTrip(md);
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).toContain("1");
    expect(result).toContain("2");
  });

  it("preserves task lists", () => {
    const md = "- [x] done\n- [ ] todo";
    const result = roundTrip(md);
    expect(result).toContain("done");
    expect(result).toContain("todo");
  });
});

// ─── HTML Elements (documenting current behavior) ────────────────────────

describe("HTML elements round-trip", () => {
  describe("details/summary", () => {
    it("preserves <details><summary> blocks", () => {
      const md = "<details>\n<summary>Click me</summary>\n\nHidden content here.\n\n</details>";
      const result = roundTrip(md);
      expect(result).toContain("<details>");
      expect(result).toContain("<summary>");
      expect(result).toContain("Click me");
      expect(result).toContain("Hidden content");
      expect(result).toContain("</details>");
    });
  });

  describe("div with attributes", () => {
    it("preserves <div> with class attribute", () => {
      const md = '<div class="warning">\n\nThis is a warning.\n\n</div>';
      const result = roundTrip(md);
      expect(result).toContain('<div class="warning">');
      expect(result).toContain("This is a warning.");
      expect(result).toContain("</div>");
    });

    it("preserves <div> with style attribute", () => {
      const md = '<div style="color: red;">Red text</div>';
      const result = roundTrip(md);
      expect(result).toContain("style=");
      expect(result).toContain("Red text");
    });

    it("preserves <div> with id attribute", () => {
      const md = '<div id="section-1">Content</div>';
      const result = roundTrip(md);
      expect(result).toContain('id="section-1"');
    });
  });

  describe("span with attributes", () => {
    it("preserves <span> with style", () => {
      const md = 'Text with <span style="color:blue;">blue</span> word.';
      const result = roundTrip(md);
      expect(result).toContain("<span");
      expect(result).toContain("blue");
    });
  });

  describe("media elements", () => {
    it("preserves <video> tags", () => {
      const md = '<video src="demo.mp4" controls></video>';
      const result = roundTrip(md);
      expect(result).toContain("<video");
      expect(result).toContain("demo.mp4");
    });

    it("preserves <audio> tags", () => {
      const md = '<audio src="clip.mp3" controls></audio>';
      const result = roundTrip(md);
      expect(result).toContain("<audio");
      expect(result).toContain("clip.mp3");
    });

    it("preserves <iframe> tags", () => {
      const md = '<iframe src="https://example.com" width="600" height="400"></iframe>';
      const result = roundTrip(md);
      expect(result).toContain("<iframe");
      expect(result).toContain("https://example.com");
    });
  });

  describe("semantic inline elements", () => {
    it("preserves <sup> (superscript)", () => {
      const md = "E = mc<sup>2</sup>";
      const result = roundTrip(md);
      expect(result).toContain("<sup>2</sup>");
    });

    it("preserves <sub> (subscript)", () => {
      const md = "H<sub>2</sub>O";
      const result = roundTrip(md);
      expect(result).toContain("<sub>2</sub>");
    });

    it("preserves <kbd> (keyboard input)", () => {
      const md = "Press <kbd>Ctrl</kbd>+<kbd>C</kbd>";
      const result = roundTrip(md);
      expect(result).toContain("<kbd>");
    });

    it("preserves <abbr> (abbreviation)", () => {
      const md = '<abbr title="HyperText Markup Language">HTML</abbr>';
      const result = roundTrip(md);
      expect(result).toContain("<abbr");
      expect(result).toContain("title=");
    });

    it("preserves <mark> (highlight)", () => {
      const md = "This is <mark>highlighted</mark> text.";
      const result = roundTrip(md);
      expect(result).toContain("<mark>");
    });
  });

  describe("HTML comments", () => {
    it.fails("preserves HTML comments", () => {
      const md = "<!-- TODO: review this section -->\n\nContent here.";
      const result = roundTrip(md);
      expect(result).toContain("<!--");
      expect(result).toContain("-->");
    });
  });

  describe("table with HTML attributes", () => {
    it.fails("preserves colspan in tables", () => {
      const md = '<table>\n<tr><td colspan="2">Spanning</td></tr>\n<tr><td>A</td><td>B</td></tr>\n</table>';
      const result = roundTrip(md);
      expect(result).toContain("colspan");
    });
  });

  describe("line breaks", () => {
    it("preserves <br> tags", () => {
      const md = "Line one<br>Line two";
      const result = roundTrip(md);
      // br may convert to markdown line break or be preserved — either is acceptable
      expect(result).toContain("Line one");
      expect(result).toContain("Line two");
    });
  });

  describe("nested HTML structures", () => {
    it("preserves nested div structure", () => {
      const md = '<div class="outer">\n<div class="inner">\n\nNested content\n\n</div>\n</div>';
      const result = roundTrip(md);
      expect(result).toContain("outer");
      expect(result).toContain("inner");
      expect(result).toContain("Nested content");
      expect(result).toContain("</div>");
    });
  });

  describe("GitHub-flavored HTML", () => {
    it("preserves <picture> with <source> for dark/light images", () => {
      const md = '<picture>\n<source media="(prefers-color-scheme: dark)" srcset="dark.png">\n<img src="light.png">\n</picture>';
      const result = roundTrip(md);
      expect(result).toContain("<picture>");
      expect(result).toContain("<source");
      expect(result).toContain("dark.png");
    });

    it("preserves <dl> <dt> <dd> (definition lists)", () => {
      const md = "<dl>\n<dt>Term</dt>\n<dd>Definition</dd>\n</dl>";
      const result = roundTrip(md);
      expect(result).toContain("<dl>");
      expect(result).toContain("<dt>");
      expect(result).toContain("Term");
    });
  });
});
