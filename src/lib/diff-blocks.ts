/**
 * Pure block-parsing helpers for the diff viewer.
 *
 * These functions turn a markdown source string into the rendered-
 * block structure that MarDoc's PR review UI operates on. They used to
 * live inside DiffViewer.tsx as private helpers — extracted here so
 * they can be unit-tested in isolation. Extraction is a pure refactor:
 * same input, same output, no behavior change.
 *
 * The functions back the README's two load-bearing claims:
 *
 *   1. "Renders your GitHub PR diffs as rich, formatted documents —
 *      not raw text with + and - lines."
 *         → blockToHtml(block) produces HTML through Showdown; the
 *           DiffViewer then renders that HTML inside `.diff-content`
 *           with typography applied. Tested in diff-blocks.test.ts
 *           with the explicit regression guard that the output has
 *           no leading "+"/"-" prefixes.
 *
 *   2. "Select any passage, leave a comment, tied to the exact line
 *      range."
 *         → parseBlocks + computeBlockLineRanges map a selection's
 *           position back to the source file's line numbers, which
 *           flow into PendingInlineComment { path, line, startLine }
 *           and ultimately to GitHub's pulls.createReview endpoint.
 *           Tested with various shapes and explicit line-number
 *           invariants.
 */

import Showdown from "showdown";
import { diffWords } from "diff";
import { transformGitHubAlerts } from "@/lib/github-alerts";
import { transformFootnotes } from "@/lib/footnotes";

// ─── Block parsing ───────────────────────────────────────────────────────

/**
 * Split a markdown source string into rendered "blocks". Blocks are
 * either paragraphs (runs of non-blank lines separated by blank lines)
 * or fenced code blocks (which keep their trailing fence together).
 *
 * Each returned block is trim()'d. Blank runs between blocks are
 * dropped — the caller works from line ranges (computeBlockLineRanges)
 * if it needs source-position accuracy.
 */
export function parseBlocks(md: string): string[] {
  const blocks: string[] = [];
  const lines = md.split("\n");
  let currentBlock = "";
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        currentBlock += line + "\n";
        blocks.push(currentBlock.trim());
        currentBlock = "";
        inCodeBlock = false;
      } else {
        if (currentBlock.trim()) blocks.push(currentBlock.trim());
        currentBlock = line + "\n";
        inCodeBlock = true;
      }
    } else if (inCodeBlock) {
      currentBlock += line + "\n";
    } else if (line.trim() === "") {
      if (currentBlock.trim()) {
        blocks.push(currentBlock.trim());
        currentBlock = "";
      }
    } else {
      currentBlock += line + "\n";
    }
  }
  if (currentBlock.trim()) blocks.push(currentBlock.trim());
  return blocks;
}

/**
 * For each block in the output of parseBlocks(source), compute the
 * 1-indexed line range it occupies in the original source. This is
 * how a click on a rendered block maps back to the source lines GitHub
 * wants for an inline review comment.
 *
 * Blocks are matched greedily by position to preserve order even when
 * the same text appears twice. If a block can't be located, a
 * fallback { startLine: 1, endLine: 1 } is emitted rather than
 * throwing — the caller at least gets a usable position.
 */
export function computeBlockLineRanges(
  source: string,
  blocks: string[]
): { startLine: number; endLine: number }[] {
  const ranges: { startLine: number; endLine: number }[] = [];
  let searchFrom = 0;

  for (const block of blocks) {
    const idx = source.indexOf(block, searchFrom);
    if (idx === -1) {
      ranges.push({ startLine: 1, endLine: 1 });
      continue;
    }
    const beforeStart = source.slice(0, idx);
    const beforeEnd = source.slice(0, idx + block.length);
    const startLine = (beforeStart.match(/\n/g) || []).length + 1;
    const endLine = (beforeEnd.match(/\n/g) || []).length + 1;
    ranges.push({ startLine, endLine });
    searchFrom = idx + block.length;
  }

  return ranges;
}

// ─── HTML rendering ─────────────────────────────────────────────────────

// Showdown converter tuned for diff-block rendering. Kept separate
// from the Editor's converter so the diff view can use tighter options
// (no mid-word underscores, no auto-link-wrap on URLs inside code, etc.).
const diffShowdownConverter = new Showdown.Converter({
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

/**
 * Render a single markdown block to HTML. Runs through the same
 * footnote + alerts post-processors the Editor uses so feature
 * rendering is consistent across the two surfaces. Callers are
 * responsible for any syntax-highlighting pass they want on top
 * (the DiffViewer wraps this in highlightCodeBlocks).
 */
export function blockToHtml(block: string): string {
  return transformGitHubAlerts(
    diffShowdownConverter.makeHtml(transformFootnotes(block))
  );
}

// ─── Word-level diff ────────────────────────────────────────────────────

/**
 * Compute an inline word-level diff between two text strings and
 * return an HTML string with added words wrapped in
 * `<span class="diff-added">` and removed words in
 * `<span class="diff-removed">`.
 *
 * This is the mechanism that makes the README's "not raw text with +
 * and - lines" claim true — added/removed content is surfaced via
 * semantic spans, not by prefixing lines with `+`/`-`.
 */
export function computeWordDiff(oldText: string, newText: string): string {
  const changes = diffWords(oldText, newText);
  return changes
    .map((part) => {
      if (!part.added && !part.removed) return part.value;
      // Keep leading/trailing newlines outside the span so the diff
      // marker never occupies the same line as a fenced-code delimiter
      // (``` on its own line). Otherwise Showdown loses the fence and
      // the whole block renders as inline code with a literal
      // `<span class="diff-…">` visible to the reader.
      const leading = part.value.match(/^\n+/)?.[0] ?? "";
      const trailing = part.value.match(/\n+$/)?.[0] ?? "";
      const core = part.value.slice(
        leading.length,
        part.value.length - trailing.length
      );
      if (!core) return part.value;
      const cls = part.added ? "diff-added" : "diff-removed";
      return `${leading}<span class="${cls}">${core}</span>${trailing}`;
    })
    .join("");
}
