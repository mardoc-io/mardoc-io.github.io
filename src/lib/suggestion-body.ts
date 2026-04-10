/**
 * Build a GitHub suggestion body that safely wraps arbitrary markdown,
 * including content that itself contains fenced code blocks.
 *
 * GitHub's inline-suggestion syntax is:
 *
 *   ```suggestion
 *   <content>
 *   ```
 *
 * If `<content>` contains three backticks anywhere (e.g. a nested
 * ```json ... ``` block), the inner fence closes the outer one early and
 * GitHub's parser sees a broken suggestion + an orphaned code block +
 * stray backticks. The suggestion becomes unapplicable and the sub-section
 * around it visually collapses into a regular comment.
 *
 * CommonMark solution: use an outer fence with more backticks than any run
 * of backticks inside the content. This helper picks the shortest safe
 * fence that satisfies that constraint.
 *
 * Extracted as a pure function so the behavior is testable without a PR.
 */
export function buildSuggestionBody(editedMarkdown: string): string {
  const fence = pickSafeFence(editedMarkdown);
  return `${fence}suggestion\n${editedMarkdown}\n${fence}`;
}

/**
 * Pick a backtick-fence of length >= 3 that is longer than any run of
 * consecutive backticks inside the given content.
 */
export function pickSafeFence(content: string): string {
  let longestRun = 0;
  let currentRun = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "`") {
      currentRun++;
      if (currentRun > longestRun) longestRun = currentRun;
    } else {
      currentRun = 0;
    }
  }
  const fenceLength = Math.max(3, longestRun + 1);
  return "`".repeat(fenceLength);
}

/**
 * Parse a GitHub suggestion body and return the inner content, or null if
 * the body is not a suggestion. Handles variable-length fences — the
 * opening fence may be 3+ backticks depending on what buildSuggestionBody
 * had to pick to avoid collision with nested code blocks.
 *
 * Matches the fence length on the closer so an inner ``` doesn't terminate
 * the outer suggestion early when parsing.
 */
export function parseSuggestionBody(body: string): string | null {
  // Anchor at the start of the body. The opener is: {n>=3}backticks +
  // "suggestion" + newline. The closer is: the same number of backticks
  // on its own line at the end.
  const openMatch = body.match(/^(`{3,})suggestion\r?\n/);
  if (!openMatch) return null;
  const fence = openMatch[1];
  const afterOpen = body.slice(openMatch[0].length);

  // Find the closer: newline + fence, optionally followed by newline/EOF.
  // Use indexOf on the exact fence string to respect length.
  const closer = `\n${fence}`;
  const closerIdx = afterOpen.lastIndexOf(closer);
  if (closerIdx === -1) return null;

  // Ensure the closer is at a line boundary at the end (fence on its own
  // line, optionally trailed by whitespace/newline).
  const tail = afterOpen.slice(closerIdx + closer.length);
  if (tail.length > 0 && !/^\s*$/.test(tail)) return null;

  return afterOpen.slice(0, closerIdx);
}
