"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  GitPullRequest,
  GitMerge,
  ArrowLeft,
  MessageSquare,
  Check,
  FileText,
  Loader2,
} from "lucide-react";
import { PullRequest, PRComment, PendingSuggestion } from "@/types";
import { useApp } from "@/lib/app-context";
import { createPRComment, createInlineComment, replyToReviewComment, fetchPRComments, resolveReviewThread, applySuggestion, mapSelectionToLines } from "@/lib/github-api";
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

  // Poll for new comments every 30s when authenticated
  useEffect(() => {
    if (isDemoMode || !currentRepo || !pr.number) return;

    const poll = setInterval(async () => {
      try {
        const fresh = await fetchPRComments(currentRepo, pr.number);
        setComments(fresh);
      } catch {
        // Silently skip — next poll will retry
      }
    }, 30_000);

    return () => clearInterval(poll);
  }, [isDemoMode, currentRepo, pr.number]);

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
      replies: [],
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

  const handleResolveComment = useCallback(async (commentId: string) => {
    const comment = comments.find((c) => c.id === commentId);

    // Optimistic local update
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c))
    );

    // Push to GitHub if the comment has a thread ID
    if (!isDemoMode && comment?.threadId) {
      try {
        await resolveReviewThread(comment.threadId, true);
      } catch (err) {
        console.error("Failed to resolve thread on GitHub:", err);
      }
    }
  }, [comments, isDemoMode]);

  const handleReplyComment = useCallback(async (commentId: string, body: string) => {
    const comment = comments.find((c) => c.id === commentId);

    // Optimistic local update
    const localReply = {
      id: `r-${Date.now()}`,
      author: "you",
      avatarColor: "#2a9d8f",
      body,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, replies: [...c.replies, localReply] }
          : c
      )
    );

    // Post to GitHub if authenticated and comment has a GitHub ID
    if (!isDemoMode && currentRepo && pr.number && comment?.githubId) {
      try {
        await replyToReviewComment(currentRepo, pr.number, comment.githubId, body);
      } catch (err) {
        console.error("Failed to post reply to GitHub:", err);
        // Fall back to a general PR comment with context
        try {
          const fallbackBody = comment.selectedText
            ? `> _Re: "${comment.selectedText}"_\n\n${body}`
            : body;
          await createPRComment(currentRepo, pr.number, fallbackBody);
        } catch (fallbackErr) {
          console.error("Fallback reply also failed:", fallbackErr);
        }
      }
    }
  }, [comments, isDemoMode, currentRepo, pr.number]);

  const handleSubmitSuggestions = useCallback(async (suggestions: PendingSuggestion[]) => {
    const file = prFiles[selectedPRFileIdx];
    if (!file) return;

    for (const suggestion of suggestions) {
      const body = `\`\`\`suggestion\n${suggestion.editedMarkdown}\n\`\`\``;

      // Optimistic local comment
      const newComment: PRComment = {
        id: `s-${Date.now()}-${suggestion.blockIndex}`,
        author: "you",
        avatarColor: "#264653",
        body,
        createdAt: new Date().toISOString(),
        blockIndex: suggestion.blockIndex,
        selectedText: suggestion.originalMarkdown.slice(0, 60),
        resolved: false,
        replies: [],
      };
      setComments((prev) => [...prev, newComment]);

      if (!isDemoMode && currentRepo && pr.number) {
        try {
          await createInlineComment(
            currentRepo,
            pr.number,
            body,
            file.path,
            suggestion.endLine,
            suggestion.startLine !== suggestion.endLine ? suggestion.startLine : undefined,
            "RIGHT"
          );
        } catch (err) {
          console.error("Failed to post suggestion to GitHub:", err);
          // Fallback to general PR comment
          try {
            const fallbackBody = `**${file.path}** (L${suggestion.startLine}–L${suggestion.endLine})\n\n${body}`;
            await createPRComment(currentRepo, pr.number, fallbackBody);
          } catch (fallbackErr) {
            console.error("Fallback suggestion also failed:", fallbackErr);
          }
        }
      }
    }
  }, [currentRepo, isDemoMode, pr.number, prFiles, selectedPRFileIdx]);

  const handleAcceptSuggestion = useCallback(async (commentId: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    const file = prFiles[selectedPRFileIdx];
    if (!file) return;

    // Parse suggestion from comment body
    const match = comment.body.match(/```suggestion\n([\s\S]*?)\n```/);
    if (!match) return;

    const replacementText = match[1];

    // Get line range from the comment's selected text
    const selectedText = comment.selectedText || "";
    const { startLine, endLine } = mapSelectionToLines(file.headContent, selectedText);

    if (!isDemoMode && currentRepo) {
      try {
        await applySuggestion(
          currentRepo,
          pr.headBranch,
          file.path,
          startLine,
          endLine,
          replacementText
        );

        // Resolve the comment thread after applying
        if (comment.threadId) {
          await resolveReviewThread(comment.threadId, true);
        }

        // Mark resolved locally
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c))
        );
      } catch (err) {
        console.error("Failed to apply suggestion:", err);
      }
    } else {
      // Demo mode: just resolve locally
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c))
      );
    }
  }, [comments, currentRepo, isDemoMode, pr.headBranch, prFiles, selectedPRFileIdx]);

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
            onReplyComment={handleReplyComment}
            onSubmitSuggestions={handleSubmitSuggestions}
            onAcceptSuggestion={handleAcceptSuggestion}
          />
        ) : null}
      </div>
    </div>
  );
}
