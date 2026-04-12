"use client";

import React from "react";
import { GitPullRequest, Loader2 } from "lucide-react";

export interface NewFileModalProps {
  open: boolean;
  onClose: () => void;
  filePath: string;
  onFilePathChange: (value: string) => void;
  title: string;
  onTitleChange: (value: string) => void;
  /** True when saving into an existing PR branch (adds the file to that PR). */
  isAddingToPR: boolean;
  /** PR number when adding to an existing PR — shown in the header. */
  addingToPRNumber?: number | null;
  /** PR branch name when adding to an existing PR — shown in the body. */
  addingToPRBranch?: string | null;
  isDemoMode: boolean;
  saving: boolean;
  error: string | null;
  onSubmit: () => void;
}

/**
 * Presentational modal for saving a new file to a repository — either
 * as a fresh PR or by committing to an existing PR branch. All state
 * and handlers are passed in by the parent Editor. No app-context or
 * GitHub API coupling.
 */
export default function NewFileModal({
  open,
  onClose,
  filePath,
  onFilePathChange,
  title,
  onTitleChange,
  isAddingToPR,
  addingToPRNumber,
  addingToPRBranch,
  isDemoMode,
  saving,
  error,
  onSubmit,
}: NewFileModalProps) {
  if (!open) return null;

  const canSubmit = !saving && filePath.trim() && !isDemoMode && (isAddingToPR || title.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-[420px] p-5"
        style={{ animation: "fadeInUp 0.15s ease-out" }}
      >
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <GitPullRequest size={16} className="text-[var(--accent)]" />
          {isAddingToPR ? `Add File to PR #${addingToPRNumber}` : "Save to Repository"}
        </h3>

        {isAddingToPR && (
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Committing to branch <span className="font-mono text-[var(--text-primary)]">{addingToPRBranch}</span>
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1 block">
              File path
            </label>
            <input
              autoFocus
              type="text"
              value={filePath}
              onChange={(e) => onFilePathChange(e.target.value)}
              placeholder="docs/my-document.md"
              className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] font-mono placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) onSubmit();
              }}
            />
            {filePath && !filePath.endsWith(".md") && (
              <p className="text-[10px] text-[var(--text-muted)] mt-1">.md will be appended</p>
            )}
          </div>

          {!isAddingToPR && (
            <div>
              <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1 block">
                PR title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder={`Add ${filePath || "new document"}`}
                className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canSubmit) onSubmit();
                }}
              />
            </div>
          )}

          {isDemoMode && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-3 py-2 rounded-md">
              Connect a GitHub repository in Settings to save files.
            </p>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <GitPullRequest size={13} />}
            {saving ? "Committing..." : isAddingToPR ? "Commit to PR" : "Create PR"}
          </button>
        </div>
      </div>
    </div>
  );
}
