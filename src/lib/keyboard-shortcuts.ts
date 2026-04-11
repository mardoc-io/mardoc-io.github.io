/**
 * Keyboard shortcut registry + helpers for the cheatsheet modal.
 *
 * This file is pure data and pure functions — no React, no DOM mounting.
 * The UI (KeyboardCheatsheet component) consumes this module to render a
 * filterable list; the `shouldOpenCheatsheet` predicate decides whether a
 * global `?` keypress should actually open the modal (we bail when the
 * user is typing so we don't steal their "?").
 *
 * Tested in keyboard-shortcuts.test.ts.
 */

export type ShortcutCategory = "Editor" | "Review" | "Navigation" | "Help";

export interface Shortcut {
  keys: string[];
  description: string;
  category: ShortcutCategory;
}

/**
 * The canonical shortcut list. Keep this in sync with the actual key
 * handlers in Editor.tsx / DiffViewer.tsx / app-context.tsx — if a
 * shortcut lives here and doesn't work, or works and isn't here, that's
 * a bug.
 */
export const ALL_SHORTCUTS: Shortcut[] = [
  // ─── Editor formatting ─────────────────────────────────────────────
  { keys: ["⌘", "B"], description: "Bold", category: "Editor" },
  { keys: ["⌘", "I"], description: "Italic", category: "Editor" },
  { keys: ["⌘", "E"], description: "Inline code", category: "Editor" },
  { keys: ["⌘", "K"], description: "Insert link", category: "Editor" },
  { keys: ["⌘", "Z"], description: "Undo", category: "Editor" },
  { keys: ["⌘", "⇧", "Z"], description: "Redo", category: "Editor" },
  { keys: ["⌘", "↵"], description: "Finish editing block (suggest mode)", category: "Editor" },
  { keys: ["Esc"], description: "Cancel editing block / close modal", category: "Editor" },

  // ─── Review ─────────────────────────────────────────────────────────
  { keys: ["Click", "Drag"], description: "Select text in diff to leave a comment", category: "Review" },
  { keys: ["↵"], description: "Submit comment / reply", category: "Review" },

  // ─── Help ───────────────────────────────────────────────────────────
  { keys: ["?"], description: "Open keyboard cheatsheet", category: "Help" },
];

/**
 * Group a list of shortcuts by their category, preserving input order
 * within each group.
 */
export function groupByCategory(
  shortcuts: Shortcut[]
): Record<string, Shortcut[]> {
  const out: Record<string, Shortcut[]> = {};
  for (const s of shortcuts) {
    if (!out[s.category]) out[s.category] = [];
    out[s.category].push(s);
  }
  return out;
}

/**
 * Filter a list of shortcuts by a free-form query string. Matches
 * against description, key labels, and category name. Case-insensitive.
 * Empty or whitespace-only query returns the list unchanged.
 */
export function filterShortcuts(
  shortcuts: Shortcut[],
  query: string
): Shortcut[] {
  const q = query.trim().toLowerCase();
  if (!q) return shortcuts;
  return shortcuts.filter((s) => {
    if (s.description.toLowerCase().includes(q)) return true;
    if (s.category.toLowerCase().includes(q)) return true;
    if (s.keys.some((k) => k.toLowerCase().includes(q))) return true;
    return false;
  });
}

/**
 * Predicate: should a `?` keypress open the cheatsheet modal?
 *
 * Returns true only when the key is `?` AND the event is not targeting
 * a text-entry surface (input, textarea, select, or contenteditable).
 * Pure — takes a KeyboardEvent-shaped object so it can be unit-tested
 * without a DOM.
 */
export function shouldOpenCheatsheet(event: {
  key: string;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}): boolean {
  if (event.key !== "?") return false;
  const target = event.target;
  if (!target) return true;
  if (target.isContentEditable) return false;
  const tag = (target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
  return true;
}
