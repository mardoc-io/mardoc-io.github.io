"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Keyboard } from "lucide-react";
import {
  ALL_SHORTCUTS,
  filterShortcuts,
  groupByCategory,
} from "@/lib/keyboard-shortcuts";

interface KeyboardCheatsheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Filterable keyboard shortcut reference, opened by pressing `?` anywhere
 * that isn't a text-entry surface. Pure data comes from
 * @/lib/keyboard-shortcuts — this component is just a shell around the
 * registry so the data is unit-testable without mounting React.
 */
export default function KeyboardCheatsheet({ open, onClose }: KeyboardCheatsheetProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset query every time the modal reopens so the next session starts
  // from a clean slate — and focus the search input for keyboard-first use.
  useEffect(() => {
    if (open) {
      setQuery("");
      // Wait a tick for the modal to mount before focusing.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc closes the modal. We only mount this listener while open so we
  // don't steal Esc from other components.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(
    () => filterShortcuts(ALL_SHORTCUTS, query),
    [query]
  );
  const grouped = useMemo(() => groupByCategory(filtered), [filtered]);
  const categories = Object.keys(grouped);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex md:items-center md:justify-center md:bg-black/50 bg-[var(--surface)]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="flex flex-col w-full h-full bg-[var(--surface)] overflow-hidden md:h-auto md:max-w-lg md:max-h-[80vh] md:border md:border-[var(--border)] md:rounded-lg md:shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Keyboard size={16} className="text-[var(--text-muted)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Keyboard shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter shortcuts…"
            className="w-full px-3 py-2 text-sm bg-[var(--surface-secondary)] border border-[var(--border)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>

        {/* Shortcut list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {categories.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-6">
              No shortcuts match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            categories.map((cat) => (
              <div key={cat} className="mb-4">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  {cat}
                </h3>
                <ul className="space-y-1">
                  {grouped[cat].map((s, i) => (
                    <li
                      key={`${cat}-${i}`}
                      className="flex items-center justify-between py-1 text-xs"
                    >
                      <span className="text-[var(--text-secondary)]">
                        {s.description}
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {s.keys.map((k, ki) => (
                          <kbd
                            key={ki}
                            className="px-1.5 py-0.5 min-w-[1.5em] text-center font-mono text-[10px] rounded bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-primary)]"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] text-center">
          Press{" "}
          <kbd className="px-1 py-0.5 font-mono rounded bg-[var(--surface-secondary)] border border-[var(--border)]">
            Esc
          </kbd>{" "}
          to close
        </div>
      </div>
    </div>
  );
}
