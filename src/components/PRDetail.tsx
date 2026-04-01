"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  GitPullRequest,
  GitMerge,
  ArrowLeft,
  MessageSquare,
  Check,
  FileText,
  Loader2,
} from "lucide-react";
import { PullRequest, PRFile, PRComment } from "@/types";
import { useApp } from "@/lib/app-context";
import { createPRComment, createInlineComment, fetchPRFiles, fetchPRComments } from "@/lib/github-api";
import DiffViewer from "./DiffViewer";

interface PRDetailProps {
  pr: PullRequest;
  onBack: () => void;
}

export default function PRDetail({ pr, onBack }: PRDetailProps) {
  const { currentRepo, isDemoMode } = useApp();
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [files, setFiles] = useState<PRFile[]>(pr.files);
  const [comments, setComments] = useState<PRComment[]>(pr.comments);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<
    "pending" | "approved" | "changes-requested" | null
  >(null);
  const [postingComment, setPostingComment] = useState(false);

  // Fetch PR files and comments for real repos (they come back empty from the list endpoint)
  useEffect(() => {
    if (isDemoMode || !currentRepo || files.length > 0) return;

    setLoadingFiles(true);
    Promise.all([
      fetchPRFiles(currentRepo, pr.number),
      fetchPRComments(currentRepo, pr.number),
    ])
      .then(([fetchedFiles, fetchedComments]) => {
        setFiles(fetchedFiles);
        setComments(fetchedComments);
      })
      .catch((err) => {
        console.error("Failed to load PR details:", err);
      })
      .finally(() => setLoadingFiles(false));
  }, [isDemoMode, currentRepo, pr.number, files.length]);

  const handleAddComment = useCallback(async (
    blockIndex: number,
    body: string,
    selectedText?: string,
    startLine?: number,
    endLine?: number
  ) => {
    const file = files[selectedFileIdx];

    // Optimistically add locally first
    const newComment: PRComment = {
      id: `c-${Date.now()}`,
      author: "you",
      avatarColor: "#264653",
      body,
      createdAt: new Date().toISOString(),
      blockIndex,
      selectedText,
      resolved: false,
    };
    setComments((prev) => [...prev, newComment]);

    // Post to GitHub if connected
    if (!isDemoMode && currentRepo && pr.number && file) {
      setPostingComment(true);
      try {
        if (selectedText && endLine) {
          // Use inline review comment API (tied to file + line range)
          // Build body with quoted context
          let commentBody = body;
          if (selectedText) {
            commentBody = `> _"${selectedText}"_\n\n${body}`;
          }

          await createInlineComment(
            currentRepo,
            pr.number,
            commentBody,
            file.path,
            endLine,
            startLine && startLine !== endLine ? startLine : undefined,
            "RIGHT"
          );
        } else {
          // Fall back to general PR comment for non-selection comments
          let fullBody = body;
          if (file) {
            fullBody = `**${file.path}**\n\n${fullBody}`;
          }
          await createPRComment(currentRepo, pr.number, fullBody);
        }
      } catch (err) {
        console.error("Failed to post comment to GitHub:", err);
        // If inline comment fails (e.g., line out of range), fall back to general comment
        try {
          let fallbackBody = body;
          if (selectedText) {
            fallbackBody = `> _"${selectedText}"_\n\n${body}`;
          }
          if (file) {
            fallbackBody = `**${file.path}**${startLine ? ` (L${startLine}${endLine && endLine !== startLine ? `-L${endLine}` : ""})` : ""}\n\n${fallbackBody}`;
          }
          await createPRComment(currentRepo, pr.number, fallbackBody);
        } catch (fallbackErr) {
          console.error("Fallback comment also failed:", fallbackErr);
        }
      } finally {
        setPostingComment(false);
      }
    }
  }, [currentRepo, isDemoMode, pr.number, files, selectedFileIdx]);

  const handleResolveComment = (commentId: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c))
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* PR Header */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] mb-3 transition-colors"
          >
            <ArrowLeft size={12} />
            Back to PR list
          </button>

          <div className="flex items-start gap-3">
            {pr.status === "merged" ? (
              <GitMerge size={20} className="text-purple-500 shrink-0 mt-0.5" />
            ) : (
              <GitPullRequest size={20} className="text-green-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                {pr.title}{" "}
                <span className="text-[var(--text-muted)] font-normal">
                  #{pr.number}
                </span>
              </h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-secondary)]">
                <span>
                  <strong>{pr.author}</strong> wants to merge{" "}
                  <span className="font-mono bg-[var(--surface-secondary)] px-1.5 py-0.5 rounded">
                    {pr.headBranch}
                  </span>{" "}
                  into{" "}
                  <span className="font-mono bg-[var(--surface-secondary)] px-1.5 py-0.5 rounded">
                    {pr.baseBranch}
                  </span>
                </span>
                <span className="text-[var(--text-muted)]">
                  {new Date(pr.createdAt).toLocaleDateString()}
                </span>
              </div>
              {pr.description && (
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                  {pr.description}
                </p>
              )}
            </div>
          </div>

          {/* File tabs and review actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-1">
              {files.map((file, idx) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFileIdx(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                    selectedFileIdx === idx
                      ? "bg-[var(--accent-muted)] text-[var(--accent)] font-medium"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  <FileText size={12} />
                  {file.path.split("/").pop()}
                </button>
              ))}
            </div>

            {/* Review actions */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                {postingComment ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <MessageSquare size={12} />
                    {comments.filter((c) => !c.resolved).length} active
                  </>
                )}
              </div>

              {reviewStatus ? (
                <span
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                    reviewStatus === "approved"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  }`}
                >
                  <Check size={12} />
                  {reviewStatus === "approved"
                    ? "Approved"
                    : "Changes Requested"}
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setReviewStatus("approved")}
                    className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setReviewStatus("changes-requested")}
                    className="text-xs px-3 py-1.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    Request Changes
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 overflow-hidden">
        {loadingFiles ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Loading PR files...</span>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-[var(--text-muted)]">
              No markdown files changed in this PR.
            </p>
          </div>
        ) : (
          <DiffViewer
            file={files[selectedFileIdx]}
            comments={comments.filter(
              (c) => true /* In a real app, filter by file */
            )}
            onAddComment={handleAddComment}
            onResolveComment={handleResolveComment}
          />
        )}
      </div>
    </div>
  );
}
