"use client";

import React, { useState, useCallback } from "react";
import {
  GitPullRequest,
  GitMerge,
  ArrowLeft,
  MessageSquare,
  Check,
  FileText,
  Loader2,
} from "lucide-react";
import { PullRequest, PRComment } from "@/types";
import { useApp } from "@/lib/app-context";
import { createPRComment, createInlineComment } from "@/lib/github-api";
import DiffViewer from "./DiffViewer";
import Showdown from "showdown";

const descriptionConverter = new Showdown.Converter({
  tables: true,
  tasklists: true,
  strikethrough: true,
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  ghCompatibleHeaderId: true,
});

interface PRDetailProps {
  pr: PullRequest;
  onBack: () => void;
}

export default function PRDetail({ pr, onBack }: PRDetailProps) {
  const {
    currentRepo,
    isDemoMode,
    prFiles,
    prComments,
    selectedPRFileIdx,
  } = useApp();

  const [comments, setComments] = useState<PRComment[]>(prComments);
  const [reviewStatus, setReviewStatus] = useState<
    "pending" | "approved" | "changes-requested" | null
  >(null);
  const [postingComment, setPostingComment] = useState(false);

  // Sync comments from context when they load
  React.useEffect(() => {
    if (prComments.length > 0 && comments.length === 0) {
      setComments(prComments);
    }
  }, [prComments, comments.length]);

  const selectedFile = prFiles[selectedPRFileIdx];

  const handleAddComment = useCallback(async (
    blockIndex: number,
    body: string,
    selectedText?: string,
    startLine?: number,
    endLine?: number
  ) => {
    const file = prFiles[selectedPRFileIdx];

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

    if (!isDemoMode && currentRepo && pr.number && file) {
      setPostingComment(true);
      try {
        if (selectedText && endLine) {
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
          let fullBody = body;
          if (file) {
            fullBody = `**${file.path}**\n\n${fullBody}`;
          }
          await createPRComment(currentRepo, pr.number, fullBody);
        }
      } catch (err) {
        console.error("Failed to post comment to GitHub:", err);
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
  }, [currentRepo, isDemoMode, pr.number, prFiles, selectedPRFileIdx]);

  const handleResolveComment = (commentId: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c))
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* PR Header */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={onBack}
                className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors shrink-0"
              >
                <ArrowLeft size={12} />
                Back
              </button>

              {pr.status === "merged" ? (
                <GitMerge size={16} className="text-purple-500 shrink-0" />
              ) : (
                <GitPullRequest size={16} className="text-green-500 shrink-0" />
              )}

              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {pr.title}{" "}
                  <span className="text-[var(--text-muted)] font-normal">#{pr.number}</span>
                </h1>
                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span>
                    <strong>{pr.author}</strong>{" "}
                    <span className="font-mono text-[10px] bg-[var(--surface-secondary)] px-1 py-0.5 rounded">
                      {pr.headBranch}
                    </span>
                    {" → "}
                    <span className="font-mono text-[10px] bg-[var(--surface-secondary)] px-1 py-0.5 rounded">
                      {pr.baseBranch}
                    </span>
                  </span>
                  {pr.description && (
                    <details className="inline">
                      <summary className="text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors">
                        Description
                      </summary>
                    </details>
                  )}
                </div>
              </div>
            </div>

            {/* Review actions */}
            <div className="flex items-center gap-2 shrink-0">
              {selectedFile && (
                <span className="text-xs text-[var(--text-muted)] font-mono hidden sm:block">
                  {selectedFile.path}
                </span>
              )}

              <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                {postingComment ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <MessageSquare size={12} />
                    {comments.filter((c) => !c.resolved).length}
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
                  {reviewStatus === "approved" ? "Approved" : "Changes Requested"}
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

          {/* Expanded description */}
          {pr.description && (
            <div className="mt-2 text-sm text-[var(--text-secondary)] prose prose-sm dark:prose-invert max-w-none max-h-32 overflow-y-auto hidden [details[open]~&]:block">
            </div>
          )}
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 overflow-hidden">
        {prFiles.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-[var(--text-muted)]">
              No markdown files changed in this PR.
            </p>
          </div>
        ) : selectedFile ? (
          <DiffViewer
            file={selectedFile}
            repoFullName={currentRepo || ""}
            baseBranch={pr.baseBranch}
            headBranch={pr.headBranch}
            comments={comments}
            onAddComment={handleAddComment}
            onResolveComment={handleResolveComment}
          />
        ) : null}
      </div>
    </div>
  );
}
