"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, Replace as ReplaceIcon, X, ChevronUp, ChevronDown, CaseSensitive, Regex, WholeWord } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { searchPluginKey } from "@/lib/tiptap-search-extension";
import type { FindOptions } from "@/lib/find-replace";

interface RichFindReplaceBarProps {
  /** The TipTap editor instance. Commands are dispatched against this. */
  editor: Editor;
  /** Called when the bar should close (Esc pressed, X clicked). */
  onClose: () => void;
}

/**
 * Rich-view find/replace panel. Same visual layout as the code-view
 * FindReplaceBar but drives its behavior through the
 * MardocSearchExtension's ProseMirror plugin commands instead of a
 * plain text string.
 *
 * State:
 *   - query / replacement / options live in this component
 *   - matches + currentIndex come from the plugin state (read via
 *     searchPluginKey.getState)
 *
 * Commands:
 *   - setSearchQuery fires on query/options change
 *   - gotoNext / gotoPrev navigate matches (wraps)
 *   - replaceCurrent / replaceAll rewrite the doc
 *   - clearSearch is called on close
 */
export default function RichFindReplaceBar({ editor, onClose }: RichFindReplaceBarProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [options, setOptions] = useState<FindOptions>({});
  const findInputRef = useRef<HTMLInputElement>(null);

  // Focus the find input on mount, pre-fill from the current selection
  // if the user selected a word before opening the bar.
  useEffect(() => {
    const selectedText = editor.state.doc.textBetween(
      editor.state.selection.from,
      editor.state.selection.to,
      " "
    );
    if (selectedText && selectedText.length < 80) {
      setQuery(selectedText);
      editor.commands.setSearchQuery(selectedText, options);
    }
    findInputRef.current?.focus();
    findInputRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run the search whenever query or options change.
  useEffect(() => {
    editor.commands.setSearchQuery(query, options);
  }, [query, options, editor]);

  // Read the plugin's current state — matches count and current index —
  // by re-subscribing on every render. This is cheap (synchronous read
  // of the plugin's state slot).
  const pluginState = searchPluginKey.getState(editor.state);
  const totalMatches = pluginState?.matches.length ?? 0;
  const currentIdx = pluginState?.currentIndex ?? 0;

  // Clear decorations + plugin state when the bar closes.
  const doClose = () => {
    editor.commands.clearSearch();
    onClose();
  };

  // Force a re-render when the editor state changes so the match
  // counter updates as the user types. Editor events are the canonical
  // way to subscribe.
  const [, forceRender] = useState(0);
  useEffect(() => {
    const handler = () => forceRender((n) => n + 1);
    editor.on("transaction", handler);
    return () => {
      editor.off("transaction", handler);
    };
  }, [editor]);

  const toggle = (key: keyof FindOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const matchStatus =
    totalMatches === 0
      ? query
        ? "No matches"
        : ""
      : `${currentIdx + 1} / ${totalMatches}`;

  return (
    <div
      className="sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)] px-3 py-2 flex items-center gap-2 flex-wrap"
      role="search"
      aria-label="Find and replace"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          doClose();
        }
      }}
    >
      {/* Find input */}
      <div className="flex items-center gap-1 flex-1 min-w-0 max-w-md">
        <Search size={12} className="text-[var(--text-muted)] shrink-0" />
        <input
          ref={findInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) editor.commands.gotoPreviousMatch();
              else editor.commands.gotoNextMatch();
            }
          }}
          placeholder="Find"
          className="flex-1 min-w-0 px-2 py-1 text-xs bg-[var(--surface-secondary)] border border-[var(--border)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <span className="text-[10px] text-[var(--text-muted)] font-mono min-w-[3.5em] text-right shrink-0">
          {matchStatus}
        </span>
      </div>

      {/* Option toggles */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => toggle("caseSensitive")}
          className={`p-1 rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors ${
            options.caseSensitive ? "bg-[var(--accent-muted)] text-[var(--accent)]" : ""
          }`}
          title="Match case"
          aria-pressed={!!options.caseSensitive}
        >
          <CaseSensitive size={14} />
        </button>
        <button
          onClick={() => toggle("wholeWord")}
          className={`p-1 rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors ${
            options.wholeWord ? "bg-[var(--accent-muted)] text-[var(--accent)]" : ""
          }`}
          title="Whole word"
          aria-pressed={!!options.wholeWord}
        >
          <WholeWord size={14} />
        </button>
        <button
          onClick={() => toggle("regex")}
          className={`p-1 rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors ${
            options.regex ? "bg-[var(--accent-muted)] text-[var(--accent)]" : ""
          }`}
          title="Regular expression"
          aria-pressed={!!options.regex}
        >
          <Regex size={14} />
        </button>
      </div>

      {/* Navigate */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => editor.commands.gotoPreviousMatch()}
          disabled={totalMatches === 0}
          className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-30"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={() => editor.commands.gotoNextMatch()}
          disabled={totalMatches === 0}
          className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-30"
          title="Next match (Enter)"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Replace input */}
      <div className="flex items-center gap-1 flex-1 min-w-0 max-w-md">
        <ReplaceIcon size={12} className="text-[var(--text-muted)] shrink-0" />
        <input
          type="text"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor.commands.replaceCurrentMatch(replacement);
            }
          }}
          placeholder="Replace"
          className="flex-1 min-w-0 px-2 py-1 text-xs bg-[var(--surface-secondary)] border border-[var(--border)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Replace actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => editor.commands.replaceCurrentMatch(replacement)}
          disabled={totalMatches === 0}
          className="text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-30 transition-colors"
        >
          Replace
        </button>
        <button
          onClick={() => editor.commands.replaceAllMatches(replacement)}
          disabled={totalMatches === 0}
          className="text-[10px] px-2 py-1 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 transition-colors"
        >
          Replace all
        </button>
      </div>

      {/* Close */}
      <button
        onClick={doClose}
        className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        aria-label="Close find bar"
        title="Close (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}
