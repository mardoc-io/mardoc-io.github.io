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
  X,
} from "lucide-react";
import { PullRequest, PRComment, PendingSuggestion } from "@/types";
import { useApp } from "@/lib/app-context";
import {
  createPRComment,
  replyToReviewComment,
  fetchPRComments,
  resolveReviewThread,
  applySuggestion,
  mapSelectionToLines,
  submitReview,
  type PendingInlineComment,
  type ReviewEvent,
} from "@/lib/github-api";
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
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewEvent, setReviewEvent] = useState<ReviewEvent>("COMMENT");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

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

  // Queue a comment locally as part of a pending review. It renders immediately
  // in the sidebar with a "Pending" marker; it's actually posted to GitHub when
  // the user finishes the review (submitReview with event + comments[]).
  const handleAddComment = useCallback(async (
    blockIndex: number,
    body: string,
    selectedText?: string,
    startLine?: number,
    endLine?: number
  ) => {
    const file = prFiles[selectedPRFileIdx];

    // Build the rendered body — the quoted selection lives in the body text so
    // it's visible both locally (optimistic UI) and after GitHub posts it back.
    const renderedBody = selectedText ? `> _"${selectedText}"_\n\n${body}` : body;

    const newComment: PRComment = {
      id: `c-${Date.now()}`,
      author: "you",
      avatarColor: "#264653",
      body: renderedBody,
      createdAt: new Date().toISOString(),
      blockIndex,
      selectedText,
      resolved: false,
      replies: [],
      pending: true,
      pendingPath: file?.path,
      pendingStartLine: startLine,
      pendingEndLine: endLine,
    };
    setComments((prev) => [...prev, newComment]);

    // In demo mode with no file (general comment), nothing to queue — the
    // local state above is sufficient.
    if (isDemoMode || !file) return;

    // A comment without a line range (general PR comment) can't be attached to
    // a review, so it goes straight to issues.createComment. This preserves the
    // old behavior for that case.
    if (!selectedText || !endLine) {
      try {
        const fullBody = `**${file.path}**\n\n${body}`;
        await createPRComment(currentRepo || "", pr.number, fullBody);
        // Drop the pending marker — this one is already posted.
        setComments((prev) =>
          prev.map((c) => (c.id === newComment.id ? { ...c, pending: false } : c))
        );
      } catch (err) {
        console.error("Failed to post general PR comment:", err);
      }
    }
  }, [currentRepo, isDemoMode, pr.number, prFiles, selectedPRFileIdx]);

  // Collect pending line-scoped comments into the shape submitReview expects.
  const collectPendingInlineComments = useCallback((): PendingInlineComment[] => {
    return comments
      .filter(
        (c) =>
          c.pending &&
          c.pendingPath &&
          typeof c.pendingEndLine === "number"
      )
      .map((c) => ({
        path: c.pendingPath!,
        body: c.body,
        line: c.pendingEndLine!,
        startLine:
          c.pendingStartLine && c.pendingStartLine !== c.pendingEndLine
            ? c.pendingStartLine
            : undefined,
        side: "RIGHT" as const,
      }));
  }, [comments]);

  const pendingCount = comments.filter((c) => c.pending && c.pendingPath).length;

  const openReviewModal = useCallback((event: ReviewEvent) => {
    setReviewEvent(event);
    setReviewBody("");
    setReviewError(null);
    setReviewModalOpen(true);
  }, []);

  const handleSubmitReview = useCallback(async () => {
    setReviewError(null);

    if (reviewEvent === "REQUEST_CHANGES" && !reviewBody.trim()) {
      setReviewError("GitHub requires a message when requesting changes.");
      return;
    }

    if (isDemoMode) {
      // Demo: just flip the badge and drop pending markers locally.
      setComments((prev) => prev.map((c) => ({ ...c, pending: false })));
      if (reviewEvent === "APPROVE") setReviewStatus("approved");
      if (reviewEvent === "REQUEST_CHANGES") setReviewStatus("changes-requested");
      setReviewModalOpen(false);
      return;
    }

    if (!currentRepo || !pr.number) {
      setReviewError("Not connected to a repo.");
      return;
    }

    setSubmittingReview(true);
    try {
      const inlineComments = collectPendingInlineComments();
      await submitReview(
        currentRepo,
        pr.number,
        reviewEvent,
        reviewBody.trim() || undefined,
        inlineComments
      );

      // Clear pending comments — the next poll will pull them back with proper
      // thread/github IDs. Until then, hide the local optimistic copies so the
      // sidebar doesn't show duplicates.
      setComments((prev) => prev.filter((c) => !c.pending));

      if (reviewEvent === "APPROVE") setReviewStatus("approved");
      if (reviewEvent === "REQUEST_CHANGES") setReviewStatus("changes-requested");

      setReviewModalOpen(false);

      // Trigger an immediate refresh so the posted comments show up without
      // waiting for the 30s poll.
      try {
        const fresh = await fetchPRComments(currentRepo, pr.number);
        setComments(fresh);
      } catch {
        // Next poll will catch up.
      }
    } catch (err) {
      console.error("Failed to submit review:", err);
      setReviewError(
        err instanceof Error ? err.message : "Failed to submit review"
      );
    } finally {
      setSubmittingReview(false);
    }
  }, [
    collectPendingInlineComments,
    currentRepo,
    isDemoMode,
    pr.number,
    reviewBody,
    reviewEvent,
  ]);

  const handleDiscardPending = useCallback((commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);

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

  // Suggestions queue into the same pending-review bundle as regular comments
  // so hitting "Finish review" posts one notification instead of N.
  const handleSubmitSuggestions = useCallback(async (suggestions: PendingSuggestion[]) => {
    const file = prFiles[selectedPRFileIdx];
    if (!file) return;

    const newComments: PRComment[] = suggestions.map((suggestion, i) => {
      const body = `\`\`\`suggestion\n${suggestion.editedMarkdown}\n\`\`\``;
      return {
        id: `s-${Date.now()}-${i}-${suggestion.blockIndex}`,
        author: "you",
        avatarColor: "#264653",
        body,
        createdAt: new Date().toISOString(),
        blockIndex: suggestion.blockIndex,
        selectedText: suggestion.originalMarkdown.slice(0, 60),
        resolved: false,
        replies: [],
        pending: true,
        pendingPath: file.path,
        pendingStartLine: suggestion.startLine,
        pendingEndLine: suggestion.endLine,
      };
    });

    setComments((prev) => [...prev, ...newComments]);
  }, [prFiles, selectedPRFileIdx]);

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
                <MessageSquare size={12} />
                {comments.filter((c) => !c.resolved).length}
                {pendingCount > 0 && (
                  <span className="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {pendingCount} pending
                  </span>
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
                  {pendingCount > 0 && (
                    <button
                      onClick={() => openReviewModal("COMMENT")}
                      className="text-xs px-3 py-1.5 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] transition-colors"
                    >
                      Finish Review ({pendingCount})
                    </button>
                  )}
                  <button
                    onClick={() => openReviewModal("APPROVE")}
                    className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => openReviewModal("REQUEST_CHANGES")}
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
            <div
              className="mt-2 text-sm text-[var(--text-secondary)] prose prose-sm dark:prose-invert max-w-none max-h-40 overflow-y-auto border-t border-[var(--border)] pt-2"
              dangerouslySetInnerHTML={{ __html: descriptionConverter.makeHtml(pr.description) }}
            />
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
            onDiscardPendingComment={handleDiscardPending}
          />
        ) : null}
      </div>

      {reviewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !submittingReview && setReviewModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Finish your review
              </h2>
              <button
                onClick={() => !submittingReview && setReviewModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {pendingCount > 0 && (
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                Submitting {pendingCount} pending comment{pendingCount === 1 ? "" : "s"}{" "}
                as part of this review.
              </p>
            )}

            <textarea
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              placeholder={
                reviewEvent === "REQUEST_CHANGES"
                  ? "Required: explain what needs to change..."
                  : "Leave a comment (optional)"
              }
              className="w-full min-h-[100px] p-3 text-sm bg-[var(--surface-secondary)] border border-[var(--border)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              disabled={submittingReview}
            />

            <div className="mt-3 space-y-2">
              <label className="flex items-start gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                <input
                  type="radio"
                  name="review-event"
                  value="COMMENT"
                  checked={reviewEvent === "COMMENT"}
                  onChange={() => setReviewEvent("COMMENT")}
                  disabled={submittingReview}
                  className="mt-0.5"
                />
                <span>
                  <strong>Comment.</strong>{" "}
                  <span className="text-[var(--text-muted)]">
                    Submit general feedback without explicit approval.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                <input
                  type="radio"
                  name="review-event"
                  value="APPROVE"
                  checked={reviewEvent === "APPROVE"}
                  onChange={() => setReviewEvent("APPROVE")}
                  disabled={submittingReview}
                  className="mt-0.5"
                />
                <span>
                  <strong>Approve.</strong>{" "}
                  <span className="text-[var(--text-muted)]">
                    Submit feedback and approve merging these changes.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                <input
                  type="radio"
                  name="review-event"
                  value="REQUEST_CHANGES"
                  checked={reviewEvent === "REQUEST_CHANGES"}
                  onChange={() => setReviewEvent("REQUEST_CHANGES")}
                  disabled={submittingReview}
                  className="mt-0.5"
                />
                <span>
                  <strong>Request changes.</strong>{" "}
                  <span className="text-[var(--text-muted)]">
                    Submit feedback that must be addressed before merging.
                  </span>
                </span>
              </label>
            </div>

            {reviewError && (
              <p className="mt-3 text-xs text-red-600 dark:text-red-400">
                {reviewError}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setReviewModalOpen(false)}
                disabled={submittingReview}
                className="text-xs px-3 py-1.5 border border-[var(--border)] text-[var(--text-secondary)] rounded-md hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className="text-xs px-3 py-1.5 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {submittingReview && <Loader2 size={12} className="animate-spin" />}
                Submit review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
