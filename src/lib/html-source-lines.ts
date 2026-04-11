/**
 * Walks an HTML source string and injects a `data-mardoc-line="N"`
 * attribute on every element's opening tag, where N is the 1-indexed
 * line number the tag starts on in the source.
 *
 * Used by feature 033 (inline comments on HTML files). When the
 * rendered HTML is loaded into the review iframe, a companion script
 * walks up from the user's selection to the nearest ancestor with a
 * `data-mardoc-line` attribute and postMessages the line number to
 * the parent. That line number feeds the same comment-submission
 * pipeline that markdown uses, so an inline comment on HTML lands
 * on the correct source range.
 *
 * The injector is careful to preserve the source byte-for-byte
 * except for the new attribute — whitespace, ordering, and
 * existing attributes are untouched. It skips HTML comments,
 * DOCTYPE declarations, and the bodies of `<script>` and `<style>`
 * tags so that text that looks like HTML inside those regions is
 * not mistaken for real elements.
 */

const ATTR_NAME = "data-mardoc-line";

export function injectSourceLineAttributes(source: string): string {
  if (!source) return "";

  let out = "";
  let i = 0;
  let line = 1;
  const len = source.length;

  while (i < len) {
    const ch = source[i];

    // Track newlines in pass-through text
    if (ch === "\n") {
      out += ch;
      line++;
      i++;
      continue;
    }

    // HTML comment: <!-- ... -->
    if (startsWith(source, i, "<!--")) {
      const end = source.indexOf("-->", i + 4);
      if (end === -1) {
        const rest = source.slice(i);
        out += rest;
        line += countNewlines(rest);
        i = len;
        break;
      }
      const chunk = source.slice(i, end + 3);
      out += chunk;
      line += countNewlines(chunk);
      i = end + 3;
      continue;
    }

    // DOCTYPE or processing instruction: <! ... > or <? ... >
    if (
      ch === "<" &&
      i + 1 < len &&
      (source[i + 1] === "!" || source[i + 1] === "?")
    ) {
      const end = source.indexOf(">", i);
      if (end === -1) {
        const rest = source.slice(i);
        out += rest;
        line += countNewlines(rest);
        i = len;
        break;
      }
      const chunk = source.slice(i, end + 1);
      out += chunk;
      line += countNewlines(chunk);
      i = end + 1;
      continue;
    }

    // Closing tag: </tagname>
    if (ch === "<" && i + 1 < len && source[i + 1] === "/") {
      const end = source.indexOf(">", i);
      if (end === -1) {
        const rest = source.slice(i);
        out += rest;
        line += countNewlines(rest);
        i = len;
        break;
      }
      const chunk = source.slice(i, end + 1);
      out += chunk;
      line += countNewlines(chunk);
      i = end + 1;
      continue;
    }

    // Opening tag: <tagname ...>
    if (ch === "<" && i + 1 < len && isTagNameStart(source[i + 1])) {
      const tagStartLine = line;
      const tagStart = i;

      // Read tag name
      let j = i + 1;
      while (j < len && isTagNameChar(source[j])) j++;
      const tagName = source.slice(i + 1, j);

      // Walk through attributes until the matching ">", respecting
      // quoted attribute values (which may contain > or newlines)
      let inQuote: '"' | "'" | null = null;
      let end = -1;
      while (j < len) {
        const c = source[j];
        if (inQuote) {
          if (c === inQuote) inQuote = null;
          if (c === "\n") line++;
          j++;
          continue;
        }
        if (c === '"' || c === "'") {
          inQuote = c;
          j++;
          continue;
        }
        if (c === ">") {
          end = j;
          break;
        }
        if (c === "\n") line++;
        j++;
      }

      if (end === -1) {
        // Malformed — emit the rest and stop
        out += source.slice(tagStart);
        i = len;
        break;
      }

      // The chunk from `<` up to and including `>`
      const tagBody = source.slice(tagStart, end + 1);
      const injected = addAttribute(tagBody, tagStartLine);
      out += injected;
      i = end + 1;

      // Skip raw-text element bodies: <script> and <style> contents
      // are not HTML and must not be rescanned
      const lower = tagName.toLowerCase();
      if (lower === "script" || lower === "style") {
        const closing = `</${lower}`;
        // Find the closing tag case-insensitively
        const remaining = source.slice(i);
        const lowerRemaining = remaining.toLowerCase();
        const closeIdx = lowerRemaining.indexOf(closing);
        if (closeIdx === -1) {
          // Unterminated — dump the rest as raw text
          out += remaining;
          line += countNewlines(remaining);
          i = len;
          break;
        }
        const body = remaining.slice(0, closeIdx);
        out += body;
        line += countNewlines(body);
        i += closeIdx;
      }

      continue;
    }

    // Default: pass-through character
    out += ch;
    i++;
  }

  return out;
}

/**
 * Insert the `data-mardoc-line` attribute into a tag body (the
 * full `<tagname ... >` string). If the tag already has the
 * attribute, returns it unchanged. Otherwise inserts the attribute
 * just before the closing `>` (or before a trailing `/` for a
 * self-closing tag).
 */
function addAttribute(tagBody: string, lineNumber: number): string {
  if (tagBody.includes(`${ATTR_NAME}=`)) return tagBody;

  // tagBody looks like `<tagname...>`
  // Strip the leading `<` and trailing `>` to work on the interior
  const interior = tagBody.slice(1, -1);
  const attr = `${ATTR_NAME}="${lineNumber}"`;

  // Self-closing: `<br />` or `<br/>`
  const selfClosingMatch = interior.match(/^([\s\S]*?)(\s*\/)$/);
  if (selfClosingMatch) {
    const [, body, tail] = selfClosingMatch;
    const spacer = body.endsWith(" ") || body.length === 0 ? "" : " ";
    return `<${body}${spacer}${attr}${tail}>`;
  }

  // Normal opening tag: append before the closing `>`
  const spacer = interior.endsWith(" ") || interior.length === 0 ? "" : " ";
  return `<${interior}${spacer}${attr}>`;
}

function startsWith(source: string, offset: number, needle: string): boolean {
  if (offset + needle.length > source.length) return false;
  for (let k = 0; k < needle.length; k++) {
    if (source[offset + k] !== needle[k]) return false;
  }
  return true;
}

function isTagNameStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isTagNameChar(ch: string): boolean {
  return (
    isTagNameStart(ch) ||
    (ch >= "0" && ch <= "9") ||
    ch === "-" ||
    ch === "_" ||
    ch === ":"
  );
}

function countNewlines(s: string): number {
  let n = 0;
  for (let k = 0; k < s.length; k++) if (s[k] === "\n") n++;
  return n;
}
