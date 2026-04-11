/**
 * Pure markdown → heading outline extractor.
 *
 * Supports ATX-style headings (# Heading 1 … ###### Heading 6), skips
 * headings inside fenced code blocks (any fence length ≥ 3), and emits
 * a GitHub-compatible slug per heading for anchor linking.
 *
 * Tested in outline.test.ts.
 */

export interface OutlineHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  slug: string;
  line: number; // 1-indexed source line
}

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.+?)\s*$/;

/**
 * Slugify a heading's text into an anchor-style id. Matches the broad
 * shape of GitHub's scheme: lowercase, strip punctuation, replace
 * whitespace and runs of non-alphanumerics with a single hyphen, trim.
 *
 * Strips inline markdown markers (`**`, `_`, `~~`, backticks) and drops
 * emoji / non-ASCII so the output stays URL-safe.
 */
export function slugifyHeading(text: string): string {
  // Strip backtick-delimited inline code first, keeping the content
  // (without the backticks themselves).
  let s = text.replace(/`([^`]+)`/g, "$1");
  // Strip bold / italic / strikethrough markers.
  s = s.replace(/(\*{1,3}|_{1,3}|~{2})/g, "");
  // Lowercase.
  s = s.toLowerCase();
  // Drop anything outside [a-z0-9\s-].
  s = s.replace(/[^a-z0-9\s-]/g, "");
  // Collapse whitespace runs.
  s = s.replace(/\s+/g, "-");
  // Collapse hyphen runs.
  s = s.replace(/-+/g, "-");
  // Trim leading/trailing hyphens.
  s = s.replace(/^-+|-+$/g, "");
  return s;
}

/**
 * Extract every heading from the markdown source. Skips headings that
 * appear inside fenced code blocks (where `# Heading` is actually a
 * comment or similar in the code). Returns headings in source order
 * with 1-indexed line numbers and deduped slugs.
 */
export function extractHeadings(markdown: string): OutlineHeading[] {
  if (!markdown) return [];

  const lines = markdown.split("\n");
  const headings: OutlineHeading[] = [];

  // Track the active fence length (0 = not in a fence). Longer outer
  // fences can contain shorter inner fences, which is how we skip the
  // whole block even when the inner contains a `# heading` literal.
  let activeFenceLength = 0;
  const fenceRe = /^(`{3,})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fence tracking. We look for a fence at the start of the line
    // (ATX + setext markers also start-of-line, so this is cheap).
    const fenceMatch = line.match(fenceRe);
    if (fenceMatch) {
      const fenceLen = fenceMatch[1].length;
      if (activeFenceLength === 0) {
        // Opening fence.
        activeFenceLength = fenceLen;
      } else if (fenceLen === activeFenceLength) {
        // Closing fence (must match the opener's length exactly).
        activeFenceLength = 0;
      }
      continue;
    }

    if (activeFenceLength !== 0) continue;

    // Indented code block: 4+ leading spaces (or a tab). Skip.
    if (/^( {4,}|\t)/.test(line)) continue;

    // ATX heading.
    const match = line.match(HEADING_RE);
    if (!match) continue;

    const hashes = match[1];
    // More than six hashes → not a heading.
    if (hashes.length > 6) continue;

    // Strip a trailing ATX closer (` #` / ` ##` / …).
    let rawText = match[2].replace(/\s+#+\s*$/, "");
    // Strip basic inline markdown for the display text.
    const displayText = stripInlineMarkdown(rawText);

    headings.push({
      level: hashes.length as OutlineHeading["level"],
      text: displayText,
      slug: slugifyHeading(rawText),
      line: i + 1,
    });
  }

  // Dedupe slugs — identical slugs get numeric suffixes (matches
  // GitHub's anchor-link scheme for duplicate headings).
  const seen = new Map<string, number>();
  for (const h of headings) {
    const count = seen.get(h.slug) || 0;
    if (count > 0) {
      h.slug = `${h.slug}-${count}`;
    }
    seen.set(h.slug.replace(/-\d+$/, ""), count + 1);
  }

  return headings;
}

function stripInlineMarkdown(s: string): string {
  let out = s;
  // Inline code — keep the content.
  out = out.replace(/`([^`]+)`/g, "$1");
  // Bold / italic / strikethrough markers.
  out = out.replace(/(\*{1,3}|_{1,3}|~{2})/g, "");
  return out;
}
