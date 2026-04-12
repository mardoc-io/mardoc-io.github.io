"use client";

import React from "react";
import { GitPullRequest, Loader2 } from "lucide-react";

export interface EditPRModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  onTitleChange: (value: string) => void;
  /** True when the current edit is on a local-only file (no repo path yet). */
  isLocalFile: boolean;
  /** For repo files: the existing path. For local files: unused (editFilePath drives instead). */
  filePath: string;
  editFilePath: string;
  onEditFilePathChange: (value: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
}

/**
 * Presentational modal for submitting edits to an existing file as a
 * new PR. Supports both repo files (filePath is fixed) and local
 * files (user enters a target path). Parent Editor passes in all
 * state and handlers.
 */
export default function EditPRModal({
  open,
  onClose,
  title,
  onTitleChange,
  isLocalFile,
  filePath,
  editFilePath,
  onEditFilePathChange,
  submitting,
  error,
  onSubmit,
}: EditPRModalProps) {
  if (!open) return null;

  const canSubmit =
    !submitting && title.trim() && (!isLocalFile || editFilePath.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-[420px] p-5"
        style={{ animation: "fadeInUp 0.15s ease-out" }}
      >
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <GitPullRequest size={16} className="text-[var(--accent)]" />
          Submit Edits as PR
        </h3>

        <p className="text-xs text-[var(--text-secondary)] mb-3">
          {isLocalFile ? (
            "This local file will be committed on a new branch and opened as a pull request."
          ) : (
            <>
              Your changes to{" "}
              <span className="font-mono text-[var(--text-primary)]">{filePath}</span>{" "}
              will be committed on a new branch and opened as a pull request.
            </>
          )}
        </p>

        <div className="space-y-3">
          {isLocalFile && (
            <div>
              <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1 block">
                File path in repo
              </label>
              <input
                autoFocus
                type="text"
                value={editFilePath}
                onChange={(e) => onEditFilePathChange(e.target.value)}
                placeholder="docs/my-document.md"
                className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] font-mono placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          )}
          <div>
            <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1 block">
              PR title
            </label>
            <input
              autoFocus={!isLocalFile}
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder={isLocalFile ? `Add ${editFilePath}` : `Update ${filePath}`}
              className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) onSubmit();
              }}
            />
          </div>

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
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <GitPullRequest size={13} />}
            {submitting ? "Creating..." : "Create PR"}
          </button>
        </div>
      </div>
    </div>
  );
}
