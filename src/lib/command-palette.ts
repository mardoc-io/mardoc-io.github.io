/**
 * Command palette primitives: the Command shape, a ranked filter, and
 * the keyboard predicate.
 *
 * Pure — no React, no DOM mounting. The palette UI (CommandPalette
 * component) consumes these helpers. Tested in command-palette.test.ts.
 */

export interface Command {
  /** Stable id, used as a React key and for programmatic dispatch. */
  id: string;
  /** Label shown in the palette list. */
  label: string;
  /** Optional longer description shown under the label. */
  description?: string;
  /** Grouping category shown as a small header above the item. */
  category?: string;
  /** Extra search terms — things the user might type that don't appear
   *  in the label ("dark" / "light" for a toggle-theme command, etc.). */
  keywords?: string[];
  /** Display-only key chord (e.g., ["⌘", "⇧", "P"]). Not executed. */
  shortcut?: string[];
  /** Invoked when the user selects this command. */
  handler: () => void | Promise<void>;
}

/**
 * Filter and rank commands against a free-form query.
 *
 * Matches are checked against label, category, and keywords (case-
 * insensitive substring). Ranking prefers:
 *   1. Exact label match
 *   2. Label starts with the query
 *   3. Query matches at a word boundary in the label
 *   4. Anywhere else (label, category, keywords)
 *
 * Empty / whitespace query returns the input list unchanged.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;

  const scored: Array<{ cmd: Command; score: number }> = [];

  for (const cmd of commands) {
    const label = cmd.label.toLowerCase();
    const category = (cmd.category || "").toLowerCase();
    const keywords = (cmd.keywords || []).map((k) => k.toLowerCase());

    let score = 0;
    if (label === q) {
      score = 100;
    } else if (label.startsWith(q)) {
      score = 80;
    } else if (matchesWordBoundary(label, q)) {
      score = 60;
    } else if (label.includes(q)) {
      score = 40;
    } else if (category.includes(q)) {
      score = 20;
    } else if (keywords.some((k) => k.includes(q))) {
      score = 10;
    }

    if (score > 0) {
      scored.push({ cmd, score });
    }
  }

  // Higher score first; preserve input order on ties.
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.cmd);
}

function matchesWordBoundary(text: string, query: string): boolean {
  // Check if `query` appears at the start of any word in `text`.
  // Words are separated by whitespace or punctuation.
  const idx = text.indexOf(query);
  if (idx === -1) return false;
  if (idx === 0) return true;
  const before = text.charAt(idx - 1);
  return !/[a-z0-9]/i.test(before);
}

/**
 * Predicate: should a keypress open the command palette?
 *
 * Matches Cmd+Shift+P (macOS) and Ctrl+Shift+P (Windows/Linux), case-
 * insensitive on the key. Requires the Shift modifier so plain ⌘P
 * (print) still works as the browser expects.
 *
 * Pure — takes a KeyboardEvent-shaped object.
 */
export function shouldOpenCommandPalette(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  target?: unknown;
}): boolean {
  const hasCommand = !!event.metaKey || !!event.ctrlKey;
  if (!hasCommand) return false;
  if (!event.shiftKey) return false;
  return event.key === "P" || event.key === "p";
}
