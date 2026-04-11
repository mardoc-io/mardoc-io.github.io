/**
 * TipTap extension that implements find / replace over a rich
 * document: decorations for matched ranges, commands for navigation,
 * replace, and replaceAll.
 *
 * Built from first principles on top of ProseMirror — no new npm
 * dependency. The core search logic is delegated to
 * @/lib/tiptap-search (pure, unit-tested) so the extension file itself
 * stays focused on ProseMirror glue.
 *
 * Commands exposed on the editor:
 *   setSearchQuery(query, options)   — update query, recompute matches
 *   clearSearch()                    — clear everything
 *   gotoNextMatch()                  — focus the next match (wraps)
 *   gotoPreviousMatch()              — focus the previous match (wraps)
 *   replaceCurrentMatch(replacement) — replace the focused match only
 *   replaceAllMatches(replacement)   — replace every match
 *
 * The extension also publishes its current state (query, options,
 * match count, current index) as plugin metadata so the UI can read
 * it and show a status string.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { findMatchesInRuns, type TextRun, type DocMatch } from "@/lib/tiptap-search";
import type { FindOptions } from "@/lib/find-replace";

// ─── Plugin key / state shape ─────────────────────────────────────────────

export interface SearchPluginState {
  query: string;
  options: FindOptions;
  matches: DocMatch[];
  currentIndex: number;
  decorations: DecorationSet;
}

export const searchPluginKey = new PluginKey<SearchPluginState>("mardocSearch");

function emptyState(doc?: ProseMirrorNode): SearchPluginState {
  return {
    query: "",
    options: {},
    matches: [],
    currentIndex: 0,
    decorations: DecorationSet.empty,
  };
}

// ─── Pure helpers ──────────────────────────────────────────────────────

/**
 * Walk a ProseMirror document and return the list of TextRun entries
 * — one per contiguous text node — for feeding into findMatchesInRuns.
 */
function collectRuns(doc: ProseMirrorNode): TextRun[] {
  const runs: TextRun[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      runs.push({ text: node.text, docPos: pos });
    }
    return true;
  });
  return runs;
}

/**
 * Build a DecorationSet that highlights every match, with a stronger
 * "current" highlight on the focused one.
 */
function buildDecorations(
  doc: ProseMirrorNode,
  matches: DocMatch[],
  currentIndex: number
): DecorationSet {
  const decorations: Decoration[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const isCurrent = i === currentIndex;
    decorations.push(
      Decoration.inline(m.from, m.to, {
        class: isCurrent
          ? "mardoc-search-match mardoc-search-match-current"
          : "mardoc-search-match",
      })
    );
  }
  return DecorationSet.create(doc, decorations);
}

function recomputeMatches(
  doc: ProseMirrorNode,
  query: string,
  options: FindOptions
): DocMatch[] {
  if (!query) return [];
  const runs = collectRuns(doc);
  return findMatchesInRuns(runs, query, options);
}

// ─── Extension ─────────────────────────────────────────────────────────

export interface SearchExtensionStorage {
  query: string;
  options: FindOptions;
  matches: DocMatch[];
  currentIndex: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mardocSearch: {
      setSearchQuery: (query: string, options?: FindOptions) => ReturnType;
      clearSearch: () => ReturnType;
      gotoNextMatch: () => ReturnType;
      gotoPreviousMatch: () => ReturnType;
      replaceCurrentMatch: (replacement: string) => ReturnType;
      replaceAllMatches: (replacement: string) => ReturnType;
    };
  }
}

/** Custom event fired when the user hits Cmd+F inside the rich editor.
 *  The Editor React component listens for this and opens the find bar. */
export const MARDOC_OPEN_FIND_EVENT = "mardoc:open-find";

export const MardocSearchExtension = Extension.create<{}, SearchExtensionStorage>({
  name: "mardocSearch",

  addStorage() {
    return {
      query: "",
      options: {},
      matches: [],
      currentIndex: 0,
    };
  },

  addKeyboardShortcuts() {
    return {
      // Mod+F opens the find bar via a window-level custom event —
      // the Editor component listens and flips findBarOpen state.
      // Returning true tells TipTap we handled the keypress so the
      // browser's native find doesn't also fire.
      "Mod-f": () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(MARDOC_OPEN_FIND_EVENT));
        }
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;
    return [
      new Plugin<SearchPluginState>({
        key: searchPluginKey,
        state: {
          init: (_, { doc }) => emptyState(doc),
          apply(tr, prev, _oldState, newState) {
            // If the document changed, re-run the search against the
            // new doc so decorations track content edits.
            if (tr.docChanged && prev.query) {
              const matches = recomputeMatches(newState.doc, prev.query, prev.options);
              const currentIndex = Math.min(
                Math.max(0, prev.currentIndex),
                Math.max(0, matches.length - 1)
              );
              const decorations = buildDecorations(newState.doc, matches, currentIndex);
              extension.storage.matches = matches;
              extension.storage.currentIndex = currentIndex;
              return { ...prev, matches, currentIndex, decorations };
            }

            // Commands set meta("mardocSearch") to { query, options,
            // matches?, currentIndex? } to update plugin state.
            const meta = tr.getMeta(searchPluginKey) as Partial<SearchPluginState> | undefined;
            if (meta) {
              const next = { ...prev, ...meta };
              next.decorations = buildDecorations(newState.doc, next.matches, next.currentIndex);
              extension.storage.query = next.query;
              extension.storage.options = next.options;
              extension.storage.matches = next.matches;
              extension.storage.currentIndex = next.currentIndex;
              return next;
            }

            // Position map for document changes that don't touch the
            // search state — shift existing decorations so they stay on
            // their marked ranges.
            if (tr.docChanged) {
              return {
                ...prev,
                decorations: prev.decorations.map(tr.mapping, tr.doc),
              };
            }

            return prev;
          },
        },
        props: {
          decorations(state) {
            return searchPluginKey.getState(state)?.decorations || DecorationSet.empty;
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSearchQuery:
        (query, options = {}) =>
        ({ state, dispatch }) => {
          const matches = recomputeMatches(state.doc, query, options);
          if (dispatch) {
            const tr = state.tr.setMeta(searchPluginKey, {
              query,
              options,
              matches,
              currentIndex: 0,
            });
            dispatch(tr);
          }
          return true;
        },

      clearSearch:
        () =>
        ({ state, dispatch }) => {
          if (dispatch) {
            const tr = state.tr.setMeta(searchPluginKey, {
              query: "",
              options: {},
              matches: [],
              currentIndex: 0,
            });
            dispatch(tr);
          }
          return true;
        },

      gotoNextMatch:
        () =>
        ({ state, dispatch }) => {
          const s = searchPluginKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          const nextIdx = (s.currentIndex + 1) % s.matches.length;
          if (dispatch) {
            const tr = state.tr.setMeta(searchPluginKey, {
              ...s,
              currentIndex: nextIdx,
            });
            // Move the selection to the match so the editor scrolls
            // into view and the cursor lands on the found text.
            const m = s.matches[nextIdx];
            tr.setSelection(
              (state.selection.constructor as any).create(tr.doc, m.from, m.to)
            );
            tr.scrollIntoView();
            dispatch(tr);
          }
          return true;
        },

      gotoPreviousMatch:
        () =>
        ({ state, dispatch }) => {
          const s = searchPluginKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          const prevIdx = (s.currentIndex - 1 + s.matches.length) % s.matches.length;
          if (dispatch) {
            const tr = state.tr.setMeta(searchPluginKey, {
              ...s,
              currentIndex: prevIdx,
            });
            const m = s.matches[prevIdx];
            tr.setSelection(
              (state.selection.constructor as any).create(tr.doc, m.from, m.to)
            );
            tr.scrollIntoView();
            dispatch(tr);
          }
          return true;
        },

      replaceCurrentMatch:
        (replacement) =>
        ({ state, dispatch }) => {
          const s = searchPluginKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          const m = s.matches[s.currentIndex];
          if (dispatch) {
            const tr = state.tr.insertText(replacement, m.from, m.to);
            // Recompute against the new doc inside the same transaction
            // via meta so the plugin updates decorations + index.
            const newDoc = tr.doc;
            const matches = recomputeMatches(newDoc, s.query, s.options);
            const currentIndex = Math.min(s.currentIndex, Math.max(0, matches.length - 1));
            tr.setMeta(searchPluginKey, {
              ...s,
              matches,
              currentIndex,
            });
            dispatch(tr);
          }
          return true;
        },

      replaceAllMatches:
        (replacement) =>
        ({ state, dispatch }) => {
          const s = searchPluginKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          if (dispatch) {
            // Walk matches from last to first so earlier positions
            // stay valid as we rewrite.
            const tr = state.tr;
            for (let i = s.matches.length - 1; i >= 0; i--) {
              const m = s.matches[i];
              tr.insertText(replacement, m.from, m.to);
            }
            tr.setMeta(searchPluginKey, {
              ...s,
              matches: [],
              currentIndex: 0,
            });
            dispatch(tr);
          }
          return true;
        },
    };
  },
});
