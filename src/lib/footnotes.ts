import Showdown from "showdown";

/**
 * Markdown pre-processor for GitHub-style footnotes.
 *
 * Input:
 *     Paragraph[^1].
 *
 *     [^1]: The footnote body.
 *
 * Output (markdown, to be fed into Showdown):
 *     Paragraph<sup class="footnote-ref" id="fnref-1">
 *       <a href="#fn-1">1</a>
 *     </sup>.
 *
 *     <section class="footnotes">
 *       <ol>
 *         <li id="fn-1">The footnote body. <a class="footnote-back" href="#fnref-1">↩</a></li>
 *       </ol>
 *     </section>
 *
 * Why pre-process? Showdown has no native footnote support, and its
 * reference-link parser actively mangles `[^label]: body` into
 * `<a href="body">^label</a>`. Stripping definitions and rewriting
 * references before Showdown sees them is the only clean fix.
 *
 * Numbering follows document order of first reference. Repeated
 * references to the same label share a number. Unreferenced definitions
 * are dropped. A reference without a matching definition is left as
 * literal text (Pandoc's behavior).
 *
 * Pure — no DOM. Tested in footnotes.test.ts.
 */

// [^label]: body  — definition line. Label: alphanumeric, hyphen,
// underscore. Anything after the colon is the body.
const DEFINITION_RE = /^\[\^([A-Za-z0-9_-]+)\]:\s*(.+)$/gm;

// [^label] — inline reference (not preceded by `\` escape).
const REFERENCE_RE = /\[\^([A-Za-z0-9_-]+)\]/g;

// Fenced code block. We strip code blocks before scanning for references
// so `[^1]` inside a code example isn't transformed.
const FENCE_RE = /^(`{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm;

// Inner Showdown pass used to render each footnote body's inline
// markdown (bold, italic, links, inline code) into HTML. Block HTML
// inside the footnotes <section> is not re-processed by the caller's
// Showdown, so we have to pre-render the bodies ourselves.
const bodyConverter = new Showdown.Converter({
  strikethrough: true,
  simpleLineBreaks: true,
  literalMidWordUnderscores: true,
});

function renderBodyInline(body: string): string {
  const html = bodyConverter.makeHtml(body).trim();
  // Strip the outer <p> wrapper so we end up with inline content that
  // sits cleanly inside a <li>.
  return html.replace(/^<p>([\s\S]*?)<\/p>$/, "$1");
}

export function transformFootnotes(md: string): string {
  if (!md) return md;

  // Step 1: collect definitions. Use a separate source with code blocks
  // stripped so `[^label]: body` lines inside code don't count.
  const withoutCode = md.replace(FENCE_RE, (match) => "\n".repeat(match.split("\n").length - 1));

  const definitions = new Map<string, string>();
  withoutCode.replace(DEFINITION_RE, (_full, label: string, body: string) => {
    // First definition wins if there are duplicates.
    if (!definitions.has(label)) {
      definitions.set(label, body.trim());
    }
    return "";
  });

  // Step 2: walk the code-stripped source with definition lines also
  // stripped — otherwise the `[^label]` inside a definition line itself
  // would count as a "first reference" and pull an unreferenced
  // definition into the output. Numbering follows document order of
  // first body reference.
  const withoutDefs = withoutCode.replace(DEFINITION_RE, "");
  const labelToNumber = new Map<string, number>();

  if (definitions.size > 0) {
    let next = 1;
    let match: RegExpExecArray | null;
    const refRe = new RegExp(REFERENCE_RE.source, "g");
    while ((match = refRe.exec(withoutDefs)) !== null) {
      const label = match[1];
      if (!definitions.has(label)) continue;
      if (labelToNumber.has(label)) continue;
      labelToNumber.set(label, next++);
    }
  }

  // Step 3: rewrite the original source. We always strip definition
  // lines (even unreferenced ones, so orphan definitions don't leak
  // into the rendered document). References to resolved labels become
  // <sup> markers; references without a matching definition are left
  // as literal text.
  const parts = splitOnCodeFences(md);
  const rewritten: string[] = [];
  for (const part of parts) {
    if (part.isCode) {
      rewritten.push(part.text);
      continue;
    }
    let text = part.text;
    // Strip definition lines — leave a blank line in their place so
    // neighboring paragraphs don't merge.
    text = text.replace(DEFINITION_RE, "");
    // Replace inline references.
    text = text.replace(REFERENCE_RE, (tok, label: string) => {
      const num = labelToNumber.get(label);
      if (num === undefined) return tok; // unresolved — pass through
      return `<sup class="footnote-ref" id="fnref-${num}"><a href="#fn-${num}">${num}</a></sup>`;
    });
    rewritten.push(text);
  }
  const body = rewritten.join("").replace(/\n{3,}/g, "\n\n").trim();

  // Step 4: build the footnotes section in numeric order — but only if
  // we actually have referenced definitions. Each body is pre-rendered
  // through a nested Showdown pass so inline markdown (bold, italic,
  // links, code) works inside the <li>; Showdown doesn't re-process
  // markdown inside block HTML, so we can't defer this.
  if (labelToNumber.size === 0) {
    return body;
  }

  const sorted = Array.from(labelToNumber.entries()).sort((a, b) => a[1] - b[1]);
  const items = sorted
    .map(([label, num]) => {
      const defBody = definitions.get(label) || "";
      const rendered = renderBodyInline(defBody);
      return `<li id="fn-${num}">${rendered} <a class="footnote-back" href="#fnref-${num}">↩</a></li>`;
    })
    .join("\n");

  const section = `\n\n<section class="footnotes">\n<ol>\n${items}\n</ol>\n</section>\n`;

  return body + section;
}

/**
 * Split markdown into alternating code and non-code segments so the
 * transformer can skip fenced code blocks entirely. Fences are matched
 * on variable length (≥3 backticks).
 */
function splitOnCodeFences(md: string): Array<{ isCode: boolean; text: string }> {
  const parts: Array<{ isCode: boolean; text: string }> = [];
  const lines = md.split("\n");
  let activeFence = 0;
  let buffer: string[] = [];
  let bufferIsCode = false;

  const flush = () => {
    if (buffer.length > 0) {
      parts.push({ isCode: bufferIsCode, text: buffer.join("\n") + "\n" });
      buffer = [];
    }
  };

  for (const line of lines) {
    const fence = line.match(/^(`{3,})/);
    if (fence) {
      const len = fence[1].length;
      if (activeFence === 0) {
        // Opening fence — flush the prose buffer, then start collecting
        // the code block.
        flush();
        bufferIsCode = true;
        buffer.push(line);
        activeFence = len;
      } else if (len === activeFence) {
        // Closing fence — finish the code block.
        buffer.push(line);
        flush();
        bufferIsCode = false;
        activeFence = 0;
      } else {
        // Different-length fence inside an active fence — just content.
        buffer.push(line);
      }
      continue;
    }
    buffer.push(line);
  }
  flush();
  return parts;
}
