"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import MarkdownToolbar, { ALL_FORMAT_ACTIONS } from "./MarkdownToolbar";
import { applyWrap } from "@/lib/markdown-format";

export interface SuggestBlockEditorProps {
  blockIndex: number;
  startLine: number;
  endLine: number;
  text: string;
  onTextChange: (text: string) => void;
  /** Save the current edit as a suggestion (keeps suggest mode active). */
  onFinish: () => void;
  /** Queue an empty suggestion, i.e. suggest deleting the block. */
  onDelete: () => void;
  /** Discard the edit without saving. */
  onCancel: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

/**
 * The inline block-editor for suggest mode. Shows a textarea with a
 * markdown formatting toolbar and supports keyboard shortcuts
 * (auto-surround, ⌘B/I/E/K, Escape to cancel, ⌘+Enter to save).
 *
 * Purely presentational — the parent DiffViewer owns the edit state
 * (editingBlockIndex, editingText, pendingSuggestions) and passes
 * the callbacks that mutate it.
 */
export default function SuggestBlockEditor({
  blockIndex,
  startLine,
  endLine,
  text,
  onTextChange,
  onFinish,
  onDelete,
  onCancel,
  textareaRef,
}: SuggestBlockEditorProps) {
  return (
    <div
      key={blockIndex}
      className="mb-2 rounded-lg border-2 border-[var(--accent)] bg-[var(--surface)] overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--accent-muted)] border-b border-[var(--accent)]">
        <span className="text-[10px] text-[var(--accent)] font-medium">
          Editing block — Lines {startLine}–{endLine}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onFinish}
            className="text-[10px] px-2 py-0.5 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
          >
            Done
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            title="Suggest deleting this block"
          >
            <Trash2 size={10} />
            Delete
          </button>
          <button
            onClick={onCancel}
            className="text-[10px] px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
      <MarkdownToolbar
        textareaRef={textareaRef}
        text={text}
        onTextChange={onTextChange}
      />
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onCancel();
            return;
          }
          if (e.key === "Enter" && e.metaKey) {
            onFinish();
            return;
          }
          // Auto-surround selection with matching characters
          const surroundPairs: Record<string, string> = {
            "'": "'", '"': '"', "*": "*", "_": "_",
            "(": ")", "[": "]", "{": "}", "`": "`",
          };
          if (surroundPairs[e.key]) {
            const textarea = e.currentTarget;
            if (textarea.selectionStart !== textarea.selectionEnd) {
              e.preventDefault();
              const result = applyWrap(
                text,
                textarea.selectionStart,
                textarea.selectionEnd,
                e.key,
                surroundPairs[e.key]
              );
              onTextChange(result.text);
              requestAnimationFrame(() => {
                textarea.setSelectionRange(result.selStart, result.selEnd);
              });
              return;
            }
          }
          // Hotkeys for formatting
          if (e.metaKey || e.ctrlKey) {
            const action = ALL_FORMAT_ACTIONS.find((a) => a.hotkey === e.key);
            if (action) {
              e.preventDefault();
              const textarea = e.currentTarget;
              const result = action.apply(
                text,
                textarea.selectionStart,
                textarea.selectionEnd
              );
              onTextChange(result.text);
              requestAnimationFrame(() => {
                textarea.setSelectionRange(result.selStart, result.selEnd);
              });
            }
          }
        }}
        className="w-full p-3 text-sm font-mono bg-[var(--surface)] text-[var(--text-primary)] border-none outline-none resize-y min-h-[80px]"
        rows={Math.max(3, text.split("\n").length + 1)}
      />
    </div>
  );
}
