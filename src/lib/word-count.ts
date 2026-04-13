/**
 * Word count + reading time for markdown documents.
 *
 * Not perfect — a full markdown parser would be more accurate, but we want a
 * cheap pure function that runs on every keystroke without a heavy AST pass.
 * The strategy is: strip markdown syntax and code blocks out of the source,
 * then count whitespace-delimited tokens in what's left.
 *
 * Reading time uses a standard 200 words-per-minute, rounded up to the
 * nearest whole minute, with a floor of 1 minute for any non-empty content.
 *
 * Pure — no DOM, no editor, no side effects. Tested in word-count.test.ts.
 */

const WORDS_PER_MINUTE = 200;

export function countWords(markdown: string): number {
  if (!markdown) return 0;
  const stripped = stripMarkdown(markdown);
  const trimmed = stripped.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function readingMinutes(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export interface MarkdownStats {
  words: number;
  readingMinutes: number;
}

export function analyzeMarkdown(markdown: string): MarkdownStats {
  const words = countWords(markdown);
  return { words, readingMinutes: readingMinutes(words) };
}

/**
 * HTML-aware word count. Strips script, style, and comment blocks
 * (which shouldn't count as reading content), then removes the
 * remaining tags, decodes common HTML entities, and delegates to the
 * same whitespace-tokenizer used for markdown.
 *
 * Pure — no DOM parser, just regex — so it can run on every keystroke
 * without a heavy pass.
 */
export function countHtmlWords(html: string): number {
  if (!html) return 0;
  const stripped = stripHtml(html);
  const trimmed = stripped.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function analyzeHtml(html: string): MarkdownStats {
  const words = countHtmlWords(html);
  return { words, readingMinutes: readingMinutes(words) };
}

function stripHtml(html: string): string {
  let s = html;

  // HTML comments — drop entirely.
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // Script, style, and noscript content — reading time shouldn't
  // include source code or CSS. Match any of these elements
  // case-insensitively and drop their entire inner content.
  s = s.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // All other tags — drop the tag but keep its content.
  s = s.replace(/<[^>]+>/g, " ");

  // Common named entities so "don&amp;t" counts as one word, not two.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'");

  // Numeric entities (&#123; / &#x1F600;)
  s = s.replace(/&#x([0-9a-f]+);/gi, (_m, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  );
  s = s.replace(/&#(\d+);/g, (_m, num) =>
    String.fromCodePoint(parseInt(num, 10))
  );

  return s;
}

/**
 * Strip markdown syntax and content that shouldn't count toward the word
 * count (fenced and indented code blocks, image alt text, URLs, HTML
 * comments, heading/list/blockquote markers, table pipes, horizontal rules).
 * Leaves behind plain text that can be tokenized by whitespace.
 */
function stripMarkdown(md: string): string {
  let s = md;

  // HTML comments — drop entirely.
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // Fenced code blocks — drop entirely. Match any fence length >= 3 so
  // nested ``` inside longer outer fences are handled.
  s = s.replace(/^(`{3,})[^\n]*\n[\s\S]*?\n\1/gm, " ");

  // Indented code blocks — lines starting with 4+ spaces or a tab.
  // Conservative: only strips if the line is in a "block" position, which
  // we approximate by requiring the previous line to be blank or start-of-
  // document. For the word-count use case being slightly aggressive is OK.
  s = s.replace(/(^|\n)(?: {4,}|\t)[^\n]*/g, "$1");

  // Images — drop alt text and URL entirely. Do this before links so an
  // image inside a link paragraph is cleanly removed.
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");

  // Links — keep the link text, drop the URL.
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Reference-style links — keep the text, drop the reference.
  s = s.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");

  // Heading markers (# to ######) at start of line.
  s = s.replace(/^#{1,6}\s+/gm, "");

  // Blockquote markers.
  s = s.replace(/^\s*>\s?/gm, "");

  // Unordered list bullets.
  s = s.replace(/^\s*[-*+]\s+/gm, "");

  // Ordered list numbers.
  s = s.replace(/^\s*\d+\.\s+/gm, "");

  // Horizontal rules — lines of only -, _, or * (3+).
  s = s.replace(/^\s*([-_*])\1{2,}\s*$/gm, " ");

  // Table separators — lines of only |, -, :, and whitespace.
  s = s.replace(/^\s*\|?[\s|:\-]+\|?\s*$/gm, " ");

  // Table pipes — keep cell content, drop the delimiters.
  s = s.replace(/\|/g, " ");

  // Bold / italic / strikethrough markers (but keep the content).
  s = s.replace(/(\*{1,3}|_{1,3}|~{2})/g, "");

  // Inline code — drop the backticks but keep the content.
  s = s.replace(/`([^`]+)`/g, "$1");

  return s;
}
