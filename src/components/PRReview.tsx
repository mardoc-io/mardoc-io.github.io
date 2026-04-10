"use client";

import React, { useMemo, useState } from "react";
import { GitPullRequest, Send, Loader2, AlertCircle } from "lucide-react";
import { flattenFiles } from "@/lib/mock-data";
import { useApp } from "@/lib/app-context";
import { createReviewPR } from "@/lib/github-api";
import { isMarkdownFile } from "@/lib/file-types";

export default function PRReview() {
  const { currentRepo, isDemoMode, repoFiles, refreshRepo, openPR, pullRequests } = useApp();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flatten the live repo tree to a flat list of markdown files. In demo mode
  // this falls back to the mock file list so the screen still works without a
  // token.
  const allFiles = useMemo(() => {
    return flattenFiles(repoFiles).filter((f) => isMarkdownFile(f.name));
  }, [repoFiles]);

  const canSubmit = title.trim().length > 0 && selectedFile.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);

    if (isDemoMode || !currentRepo) {
      setError(
        isDemoMode
          ? "Connect a GitHub token in Settings to create a review PR."
          : "No repository selected."
      );
      return;
    }

    setSubmitting(true);
    try {
      const pr = await createReviewPR(currentRepo, title, description, selectedFile);
      // Refresh the PR list so the new one appears in the sidebar, then
      // navigate to it. We look it up by number after refresh so PRDetail gets
      // a fully-populated PullRequest object (files, comments, etc. load lazily).
      await refreshRepo();
      // refreshRepo reloads pullRequests; find the one we just made. If it's
      // not in the refreshed list yet (eventual consistency), fall back to a
      // stub so the user still lands on something useful.
      const fresh = pullRequests.find((p) => p.number === pr.number);
      if (fresh) {
        openPR(fresh);
      } else {
        // Minimal stub — openPR will fetch files + comments from GitHub.
        openPR({
          id: `pr-${pr.number}`,
          number: pr.number,
          title: `[Review] ${title}`,
          author: "you",
          status: "open",
          createdAt: new Date().toISOString(),
          baseBranch: "main",
          headBranch: `review/${pr.number}`,
          files: [],
          comments: [],
          description: description || `Review discussion for \`${selectedFile}\``,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create review PR");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-[var(--accent-muted)] flex items-center justify-center">
            <GitPullRequest size={20} className="text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              Create Review PR
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Start a review discussion on any document — no changes required
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* File selector */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Document to review
            </label>
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
            >
              <option value="">
                {allFiles.length === 0
                  ? "No markdown files found in this repo"
                  : "Select a file..."}
              </option>
              {allFiles.map((f) => (
                <option key={f.id} value={f.path}>
                  {f.path}
                </option>
              ))}
            </select>
          </div>

          {/* PR Title */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Review title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Review: API reference accuracy check"
              disabled={submitting}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What should reviewers focus on?"
              rows={4}
              disabled={submitting}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none disabled:opacity-50"
            />
          </div>

          {/* Info box */}
          <div className="bg-[var(--accent-muted)] rounded-lg px-4 py-3">
            <p className="text-xs text-[var(--accent)] leading-relaxed">
              This creates a pull request for review and commenting purposes only.
              The document content will remain unchanged on the main branch. Reviewers
              can add inline comments on the rendered markdown, and the PR can be
              closed once the review discussion is complete.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle size={14} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--accent)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Send size={14} />
                Create Review PR
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
