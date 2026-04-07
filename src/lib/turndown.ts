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

  return turndown;
}
