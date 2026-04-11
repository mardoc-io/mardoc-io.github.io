"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Replace as ReplaceIcon, X, ChevronUp, ChevronDown, CaseSensitive, Regex, WholeWord } from "lucide-react";
import { findAll, replaceAt, replaceAll, type FindOptions, type Match } from "@/lib/find-replace";

interface FindReplaceBarProps {
  /** The current text being searched (e.g., codeContent from the editor). */
  text: string;
  /** Called when a replace or replace-all rewrites the text. */
  onTextChange: (next: string) => void;
  /** Called when the bar should close (Esc pressed, X clicked). */
  onClose: () => void;
  /** Called when the current match changes so the editor can scroll/select. */
  onMatchFocused?: (match: Match) => void;
}

/**
 * Code-view find/replace panel. Renders a horizontal bar with search +
 * replace inputs, option toggles (case / regex / whole word), and
 * next/prev/replace/replace-all controls.
 *
 * All state lives locally in the component — the parent just hands in
 * `text` and receives `onTextChange(next)` when a replace occurs.
 *
 * Logic is delegated to @/lib/find-replace, which is tested in isolation.
 */
export default function FindReplaceBar({
  text,
  onTextChange,
  onClose,
  onMatchFocused,
}: FindReplaceBarProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [options, setOptions] = useState<FindOptions>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Focus the find input on mount so the user can start typing immediately.
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  // Recompute matches whenever the query, options, or underlying text
  // changes. Reset the current index if it would now point out of bounds.
  const matches = useMemo(() => findAll(text, query, options), [text, query, options]);
  useEffect(() => {
    if (currentIdx >= matches.length) {
      setCurrentIdx(matches.length > 0 ? matches.length - 1 : 0);
    }
  }, [matches.length, currentIdx]);

  // Notify the editor when the focused match changes so it can scroll the
  // textarea and select the matched range.
  useEffect(() => {
    if (matches.length > 0 && onMatchFocused) {
      onMatchFocused(matches[currentIdx]);
    }
  }, [currentIdx, matches, onMatchFocused]);

  const goNext = () => {
    if (matches.length === 0) return;
    setCurrentIdx((i) => (i + 1) % matches.length);
  };
  const goPrev = () => {
    if (matches.length === 0) return;
    setCurrentIdx((i) => (i - 1 + matches.length) % matches.length);
  };

  const doReplace = () => {
    if (matches.length === 0) return;
    const match = matches[currentIdx];
    const next = replaceAt(text, match, replacement);
    onTextChange(next);
    // After replacing, advance to what is now at the same index (which
    // will be the next original match, since we removed the current one).
    // The matches memo will recompute on the next render.
  };

  const doReplaceAll = () => {
    if (matches.length === 0) return;
    const next = replaceAll(text, query, replacement, options);
    onTextChange(next);
    setCurrentIdx(0);
  };

  const toggle = (key: keyof FindOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const matchStatus =
    matches.length === 0
      ? query
        ? "No matches"
        : ""
      : `${currentIdx + 1} / ${matches.length}`;

  return (
    <div
      className="sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--border)] px-3 py-2 flex items-center gap-2 flex-wrap"
      role="search"
      aria-label="Find and replace"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
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
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrentIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) goPrev();
              else goNext();
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
          onClick={goPrev}
          disabled={matches.length === 0}
          className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-30"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={goNext}
          disabled={matches.length === 0}
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
              doReplace();
            }
          }}
          placeholder="Replace"
          className="flex-1 min-w-0 px-2 py-1 text-xs bg-[var(--surface-secondary)] border border-[var(--border)] rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {/* Replace actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={doReplace}
          disabled={matches.length === 0}
          className="text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-30 transition-colors"
        >
          Replace
        </button>
        <button
          onClick={doReplaceAll}
          disabled={matches.length === 0}
          className="text-[10px] px-2 py-1 rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-30 transition-colors"
        >
          Replace all
        </button>
      </div>

      {/* Close */}
      <button
        onClick={onClose}
        className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        aria-label="Close find bar"
        title="Close (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}
