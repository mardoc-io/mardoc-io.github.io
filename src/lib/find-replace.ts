/**
 * Pure string-level find/replace used by the code-view find bar.
 *
 * All functions in this module are pure and testable without a DOM.
 * The UI (FindReplaceBar) consumes them to implement the actual panel.
 *
 * Rich-view find/replace would need a TipTap extension or custom
 * ProseMirror plugin and is deliberately out of scope here — in rich
 * view, Cmd+F falls through to the browser's native Find.
 */

export interface FindOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
}

export interface Match {
  start: number;
  end: number;
}

/**
 * Locate every non-overlapping match of `query` in `text`. Returns an
 * empty array for empty input, invalid regex, or no matches. Zero-width
 * regex matches are skipped (so `^` in regex mode doesn't infinite-loop).
 */
export function findAll(
  text: string,
  query: string,
  options: FindOptions = {}
): Match[] {
  if (!query || !text) return [];

  let pattern: RegExp;
  try {
    if (options.regex) {
      pattern = new RegExp(query, options.caseSensitive ? "g" : "gi");
    } else {
      const escaped = escapeRegex(query);
      const wrapped = options.wholeWord ? `\\b${escaped}\\b` : escaped;
      pattern = new RegExp(wrapped, options.caseSensitive ? "g" : "gi");
    }
  } catch {
    // Invalid regex — treat as "no matches" rather than blowing up the UI.
    return [];
  }

  const matches: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m[0].length === 0) {
      // Zero-width match: skip it entirely and advance the lastIndex so
      // the loop terminates. We don't emit zero-width matches because
      // "replace" on them is meaningless.
      pattern.lastIndex++;
      continue;
    }
    matches.push({ start: m.index, end: m.index + m[0].length });
  }
  return matches;
}

/**
 * Replace the text at `match` with `replacement`. Pure — doesn't mutate.
 */
export function replaceAt(text: string, match: Match, replacement: string): string {
  return text.slice(0, match.start) + replacement + text.slice(match.end);
}

/**
 * Replace every occurrence of `query` in `text` with `replacement`. Uses
 * findAll + replaceAt, walking matches from right to left so earlier
 * indices stay valid as we rewrite.
 */
export function replaceAll(
  text: string,
  query: string,
  replacement: string,
  options: FindOptions = {}
): string {
  if (!query) return text;
  const matches = findAll(text, query, options);
  if (matches.length === 0) return text;

  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    result = replaceAt(result, matches[i], replacement);
  }
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
