import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";

const lowlight = createLowlight(common);

/**
 * Post-process HTML to add syntax highlighting to code blocks.
 * Finds <code class="language-xxx"> blocks produced by showdown
 * and replaces their contents with lowlight-highlighted HTML.
 */
export function highlightCodeBlocks(html: string): string {
  return html.replace(
    /<code class="([^"]*language-(\w+)[^"]*)">([\s\S]*?)<\/code>/g,
    (_match, classes, lang, code) => {
      const decoded = code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

      try {
        const tree = lowlight.highlight(lang, decoded);
        const highlighted = toHtml(tree);
        return `<code class="${classes} hljs">${highlighted}</code>`;
      } catch {
        return _match;
      }
    }
  );
}
