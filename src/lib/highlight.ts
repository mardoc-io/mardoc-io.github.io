import { common, createLowlight } from "lowlight";
import { toHtml } from "hast-util-to-html";
import type { Root, Element, ElementContent, Text } from "hast";

const lowlight = createLowlight(common);

type DiffKind = "added" | "removed";
type DiffRange = { start: number; end: number; kind: DiffKind };

/**
 * Pull `<span class="diff-added|diff-removed">…</span>` markers out of
 * `code`, returning the span-free text and the char ranges (in the
 * clean text) each marker covered. Called before handing the code to
 * lowlight so the tokenizer doesn't see the diff spans as source.
 */
function extractDiffMarkers(code: string): { clean: string; ranges: DiffRange[] } {
  const ranges: DiffRange[] = [];
  const re = /<span class="diff-(added|removed)">([\s\S]*?)<\/span>/g;
  let clean = "";
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    clean += code.slice(lastIdx, m.index);
    const start = clean.length;
    clean += m[2];
    ranges.push({ start, end: clean.length, kind: m[1] as DiffKind });
    lastIdx = m.index + m[0].length;
  }
  clean += code.slice(lastIdx);
  return { clean, ranges };
}

/**
 * Walk the highlighted hast tree and re-apply the diff ranges by
 * splitting text nodes at range boundaries and wrapping overlapping
 * segments in a `<span class="diff-added|removed">`. A range that
 * crosses hljs token boundaries produces one wrapper per affected
 * text node, which is fine because `.diff-added` styling is applied
 * by class — continuity of the visual highlight is preserved.
 */
function applyDiffRanges(tree: Root | Element, ranges: DiffRange[], offsetRef: { value: number }): void {
  const newChildren: ElementContent[] = [];
  for (const child of tree.children as ElementContent[]) {
    if (child.type === "text") {
      const textStart = offsetRef.value;
      const textEnd = textStart + child.value.length;
      const overlaps = ranges.filter((r) => r.start < textEnd && r.end > textStart);
      if (overlaps.length === 0) {
        newChildren.push(child);
      } else {
        const breaks = [textStart, textEnd];
        for (const r of overlaps) {
          if (r.start > textStart && r.start < textEnd) breaks.push(r.start);
          if (r.end > textStart && r.end < textEnd) breaks.push(r.end);
        }
        const points = Array.from(new Set(breaks)).sort((a, b) => a - b);
        for (let i = 0; i < points.length - 1; i++) {
          const segStart = points[i];
          const segEnd = points[i + 1];
          if (segStart === segEnd) continue;
          const segValue = child.value.slice(segStart - textStart, segEnd - textStart);
          const enclosing = overlaps.find((r) => r.start <= segStart && r.end >= segEnd);
          const textNode: Text = { type: "text", value: segValue };
          if (enclosing) {
            newChildren.push({
              type: "element",
              tagName: "span",
              properties: { className: [`diff-${enclosing.kind}`] },
              children: [textNode],
            });
          } else {
            newChildren.push(textNode);
          }
        }
      }
      offsetRef.value = textEnd;
    } else if (child.type === "element") {
      applyDiffRanges(child, ranges, offsetRef);
      newChildren.push(child);
    } else {
      newChildren.push(child);
    }
  }
  (tree as Root).children = newChildren as Root["children"];
}

/**
 * Post-process HTML to add syntax highlighting to code blocks.
 * Finds <code class="language-xxx"> blocks produced by showdown
 * and replaces their contents with lowlight-highlighted HTML.
 *
 * Diff markers (`<span class="diff-added|removed">`) inside a fenced
 * code block arrive here HTML-escaped by Showdown. They're decoded,
 * lifted out before highlighting, and re-wrapped around the matching
 * ranges of the highlighted output so the markers don't get
 * tokenized as source code.
 */
export function highlightCodeBlocks(html: string): string {
  return html.replace(
    /<code class="([^"]*language-(\w+)[^"]*)">([\s\S]*?)<\/code>/g,
    (_match, classes, lang, code) => {
      const decoded = code
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");

      const { clean, ranges } = extractDiffMarkers(decoded);

      try {
        const tree = lowlight.highlight(lang, clean);
        if (ranges.length > 0) {
          applyDiffRanges(tree, ranges, { value: 0 });
        }
        const highlighted = toHtml(tree);
        return `<code class="${classes} hljs">${highlighted}</code>`;
      } catch {
        return _match;
      }
    }
  );
}
