"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Command as CommandIcon } from "lucide-react";
import { filterCommands, type Command } from "@/lib/command-palette";

interface CommandPaletteProps {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

/**
 * Generic command palette modal. The palette itself is dumb — it renders
 * a filterable, keyboard-navigable list of commands and calls the
 * command's handler when selected. Commands are supplied by the caller so
 * this component has no knowledge of any specific app feature.
 *
 * Keyboard behavior:
 *   - Autofocuses the search input on open
 *   - ↑ / ↓ navigates the list, wrapping at the ends
 *   - Enter executes the selected command and closes the palette
 *   - Esc closes without executing
 *   - Click an item to execute
 *   - Click outside the panel to close
 *
 * Filtering and ranking live in @/lib/command-palette (tested
 * separately), so this shell stays thin.
 */
export default function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Reset on open: clear the query, focus the input, reset selection.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  // Clamp the selection if filtered length shrinks while the user types.
  useEffect(() => {
    if (selectedIdx >= filtered.length) {
      setSelectedIdx(filtered.length > 0 ? filtered.length - 1 : 0);
    }
  }, [filtered.length, selectedIdx]);

  // Scroll the selected item into view when it changes.
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.querySelector<HTMLLIElement>(
      `li[data-idx="${selectedIdx}"]`
    );
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const executeSelected = () => {
    const cmd = filtered[selectedIdx];
    if (!cmd) return;
    onClose();
    // Defer the handler so the modal unmounts cleanly before the command
    // takes effect (some handlers open other modals).
    setTimeout(() => {
      void cmd.handler();
    }, 0);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col md:items-start md:justify-center md:pt-[15vh] md:bg-black/50 bg-[var(--surface)]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="flex flex-col w-full h-full bg-[var(--surface)] overflow-hidden md:h-auto md:max-w-xl md:max-h-[70vh] md:mx-auto md:border md:border-[var(--border)] md:rounded-lg md:shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
          <CommandIcon size={14} className="text-[var(--text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIdx((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIdx((i) =>
                  filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length
                );
              } else if (e.key === "Enter") {
                e.preventDefault();
                executeSelected();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Type a command or search…"
            className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </div>

        {/* Command list */}
        <div className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] text-center py-6 px-4">
              No commands match &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul ref={listRef}>
              {filtered.map((cmd, i) => (
                <li
                  key={cmd.id}
                  data-idx={i}
                  onClick={executeSelected}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`px-4 py-2 cursor-pointer transition-colors flex items-center justify-between ${
                    i === selectedIdx
                      ? "bg-[var(--accent-muted)]"
                      : "hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {cmd.category && (
                        <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] shrink-0">
                          {cmd.category}
                        </span>
                      )}
                      <span
                        className={`text-xs truncate ${
                          i === selectedIdx
                            ? "text-[var(--text-primary)] font-medium"
                            : "text-[var(--text-primary)]"
                        }`}
                      >
                        {cmd.label}
                      </span>
                    </div>
                    {cmd.description && (
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
                        {cmd.description}
                      </div>
                    )}
                  </div>
                  {cmd.shortcut && cmd.shortcut.length > 0 && (
                    <span className="flex items-center gap-1 shrink-0 ml-4">
                      {cmd.shortcut.map((k, ki) => (
                        <kbd
                          key={ki}
                          className="px-1.5 py-0.5 min-w-[1.5em] text-center font-mono text-[10px] rounded bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-secondary)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)] flex items-center justify-between">
          <span>
            <kbd className="px-1 py-0.5 font-mono rounded bg-[var(--surface-secondary)] border border-[var(--border)]">
              ↑↓
            </kbd>{" "}
            navigate{" "}
            <kbd className="px-1 py-0.5 font-mono rounded bg-[var(--surface-secondary)] border border-[var(--border)]">
              ↵
            </kbd>{" "}
            run{" "}
            <kbd className="px-1 py-0.5 font-mono rounded bg-[var(--surface-secondary)] border border-[var(--border)]">
              Esc
            </kbd>{" "}
            close
          </span>
          <span>{filtered.length} command{filtered.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
