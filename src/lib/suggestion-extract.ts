import { PRComment, PendingSuggestion } from "@/types";
import { parseSuggestionBody } from "@/lib/suggestion-body";

export interface BlockRange {
  startLine: number;
  endLine: number;
}

/**
 * Extract already-submitted suggestions from a list of PR comments and map
 * them back to the block they apply to on the head side of the diff.
 *
 * GitHub review comments carry a line number (surfaced by fetchPRComments as
 * `comment.blockIndex` — badly named, but it's actually the line number from
 * pulls.listReviewComments). We use that to find the block whose range
 * contains that line.
 *
 * For locally-queued pending suggestions, `pendingEndLine` takes precedence
 * because it was captured at suggest time with full precision, while the
 * line number from GitHub can sometimes be the last line of the multi-line
 * comment range.
 *
 * Extracted as a pure function so the mapping can be tested without a real
 * DiffViewer. This is the function that was broken before: it used to map
 * via `comment.selectedText` which is only set on local optimistic copies,
 * so submitted suggestions disappeared from the suggest view after the
 * refetch replaced local state with fresh data from GitHub.
 */
export function extractCommentSuggestions(
  comments: PRComment[],
  headBlocks: string[],
  headBlockRanges: BlockRange[]
): PendingSuggestion[] {
  const results: PendingSuggestion[] = [];

  for (const comment of comments) {
    const editedMarkdown = parseSuggestionBody(comment.body);
    if (editedMarkdown === null) continue;

    // Resolve a target line number. Prefer locally-captured pending metadata
    // (more precise), fall back to whatever the GitHub API gave us.
    const endLine =
      comment.pendingEndLine ??
      (typeof comment.blockIndex === "number" ? comment.blockIndex : 0);
    const startLine =
      comment.pendingStartLine ??
      comment.pendingEndLine ??
      endLine;

    if (!endLine) continue;

    // Find the block whose range contains the target line.
    const blockIdx = headBlockRanges.findIndex(
      (r) => endLine >= r.startLine && endLine <= r.endLine
    );
    if (blockIdx === -1) continue;

    results.push({
      blockIndex: blockIdx,
      originalMarkdown: headBlocks[blockIdx],
      editedMarkdown,
      startLine,
      endLine,
    });
  }

  return results;
}

/**
 * Merge locally-pending suggestions (still being edited) with
 * already-submitted suggestions (fetched from GitHub). Local pending wins on
 * conflict — the user's in-progress edit takes precedence over what was
 * previously submitted for the same block.
 */
export function mergeSuggestions(
  pending: PendingSuggestion[],
  submitted: PendingSuggestion[]
): PendingSuggestion[] {
  const merged = [...pending];
  for (const s of submitted) {
    if (!merged.some((p) => p.blockIndex === s.blockIndex)) {
      merged.push(s);
    }
  }
  return merged;
}
