import TurndownService from "turndown";

/**
 * Creates a configured TurndownService that preserves HTML elements
 * commonly found in GitHub-flavored markdown.
 */
export function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Strikethrough (GFM)
  turndown.addRule("strikethrough", {
    filter: ["del", "s"],
    replacement: (content) => `~~${content}~~`,
  });

  // Preserve these HTML elements as-is (they have no markdown equivalent)
  turndown.keep([
    "details",
    "summary",
    "sup",
    "sub",
    "kbd",
    "abbr",
    "mark",
    "video",
    "audio",
    "iframe",
    "picture",
    "source",
    "dl",
    "dt",
    "dd",
  ]);

  // Images with original src — restore the original URL instead of data: or blob: URIs
  turndown.addRule("imageWithOriginalSrc", {
    filter: (node) => {
      return node.nodeName === "IMG" && node.hasAttribute("data-original-src");
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const src = el.getAttribute("data-original-src") || "";
      const alt = el.getAttribute("alt") || "";
      return `![${alt}](${src})`;
    },
  });

  // Mermaid diagrams — restore fenced code blocks from rendered <img> tags
  turndown.addRule("mermaidDiagram", {
    filter: (node) => {
      return node.nodeName === "IMG" && node.hasAttribute("data-mermaid-source");
    },
    replacement: (_content, node) => {
      const source = (node as HTMLElement).getAttribute("data-mermaid-source") || "";
      return `\n\n\`\`\`mermaid\n${source}\n\`\`\`\n\n`;
    },
  });

  // Preserve div and span with attributes (class, style, id)
  turndown.addRule("divWithAttributes", {
    filter: (node) => {
      if (node.nodeName !== "DIV") return false;
      return node.hasAttribute("class") || node.hasAttribute("style") || node.hasAttribute("id");
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      return `\n\n${el.outerHTML}\n\n`;
    },
  });

  turndown.addRule("spanWithAttributes", {
    filter: (node) => {
      if (node.nodeName !== "SPAN") return false;
      return node.hasAttribute("class") || node.hasAttribute("style") || node.hasAttribute("id");
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      return el.outerHTML;
    },
  });

  // GFM tables. Turndown has no built-in table handling — left alone, a
  // <table> falls through to the default element walker which extracts
  // cell text and emits each cell as a separate paragraph. The saved file
  // ends up as "foo\n\nbar\n\nzar\n\n..." instead of a real markdown table.
  //
  // This rule serializes the whole <table> subtree into a GFM-style
  // | Header | ... |
  // | ---    | ... |
  // | cell   | ... |
  // block. The children (thead/tbody/tr/td) still get walked by turndown,
  // but we ignore their contribution (the `_content` arg) since we're
  // rebuilding from the DOM directly.
  turndown.addRule("gfmTable", {
    filter: "table",
    replacement: (_content, node) => {
      const el = node as HTMLTableElement;
      const rows = Array.from(el.querySelectorAll("tr"));
      if (rows.length === 0) return "";

      // Column count from the first row — use it as the canonical width and
      // pad short rows to keep the markdown table rectangular.
      const colCount = Math.max(
        ...rows.map((r) => (r as HTMLTableRowElement).cells.length)
      );
      if (colCount === 0) return "";

      const cellText = (c: HTMLTableCellElement): string => {
        // Flatten the cell text and escape any pipes so they don't break
        // the markdown table cell boundary. Collapse newlines to spaces —
        // GFM tables can't contain raw newlines inside cells.
        return (c.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\|/g, "\\|");
      };

      const formatRow = (row: HTMLTableRowElement): string => {
        const cells: string[] = [];
        for (let i = 0; i < colCount; i++) {
          const c = row.cells[i];
          cells.push(c ? cellText(c) : "");
        }
        return "| " + cells.join(" | ") + " |";
      };

      const lines: string[] = [];
      lines.push(formatRow(rows[0]));
      lines.push("| " + Array(colCount).fill("---").join(" | ") + " |");
      for (let i = 1; i < rows.length; i++) {
        lines.push(formatRow(rows[i]));
      }

      return "\n\n" + lines.join("\n") + "\n\n";
    },
  });

  return turndown;
}
