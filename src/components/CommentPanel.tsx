"use client";

import React, { useState } from "react";
import { X, MessageSquare, Check, Send } from "lucide-react";
import { parseSuggestionBody } from "@/lib/suggestion-body";

// ─── Comment panel — the one and only place PR comments render ──────────

export interface PanelComment {
  id: string;
  selectedText: string;
  body: string;
  author: string;
  avatarColor: string;
  createdAt: string;
  blockIndex: number;
  resolved: boolean;
  startLine?: number;
  endLine?: number;
  replies: { author: string; avatarColor: string; body: string; createdAt: string }[];
  source: "local" | "github";
  pending?: boolean;
}

export interface CommentPanelProps {
  comments: PanelComment[];
  activeCommentId: string | null;
  onSelect: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onResolve: (id: string) => void;
  onAccept?: (id: string) => void;
  onDiscardPending?: (id: string) => void;
  onClose: () => void;
}

export default function CommentPanel({
  comments,
  activeCommentId,
  onSelect,
  onReply,
  onResolve,
  onAccept,
  onDiscardPending,
  onClose,
}: CommentPanelProps) {
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const activeCount = comments.filter((c) => !c.resolved).length;

  return (
    <div className="w-72 shrink-0 border-l border-[var(--border)] bg-[var(--surface-secondary)] flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
        <span className="text-xs font-medium text-[var(--text-primary)]">
          Comments ({activeCount})
        </span>
        <button onClick={onClose} className="toolbar-btn" style={{ width: 24, height: 24 }}>
          <X size={12} />
        </button>
      </div>

      {activeCount === 0 && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <MessageSquare size={24} className="mx-auto mb-2 text-[var(--text-muted)]" />
            <p className="text-xs text-[var(--text-muted)]">
              No comments yet. Select text in the diff to add one.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {comments
          .filter((c) => !c.resolved)
          .map((comment) => (
            <div
              key={comment.id}
              onClick={() => onSelect(comment.id)}
              className={`rounded-lg border transition-colors cursor-pointer ${
                activeCommentId === comment.id
                  ? "border-[var(--accent)] bg-[var(--surface)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
              }`}
            >
              {/* Quoted text */}
              {comment.selectedText && (
                <div className="px-3 pt-2.5 pb-1">
                  <div className="text-[10px] text-[var(--accent)] bg-[var(--accent-muted)] px-2 py-1 rounded-md font-mono leading-snug line-clamp-2 mb-2">
                    &ldquo;{comment.selectedText}&rdquo;
                  </div>
                  {comment.startLine && (
                    <div className="text-[9px] text-[var(--text-muted)] mb-1">
                      {comment.startLine === comment.endLine
                        ? `Line ${comment.startLine}`
                        : `Lines ${comment.startLine}–${comment.endLine}`}
                    </div>
                  )}
                </div>
              )}

              {/* Main comment */}
              <div className="px-3 pb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-medium"
                    style={{ backgroundColor: comment.avatarColor }}
                  >
                    {comment.author[0].toUpperCase()}
                  </div>
                  <span className="text-[11px] font-medium text-[var(--text-primary)]">
                    {comment.author}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {new Date(comment.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {comment.pending ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">
                      Pending
                    </span>
                  ) : comment.source === "github" ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-muted)]">
                      GitHub
                    </span>
                  ) : null}
                  {comment.pending && onDiscardPending && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDiscardPending(comment.id);
                      }}
                      className="ml-auto text-[9px] text-[var(--text-muted)] hover:text-red-600 transition-colors"
                      title="Discard this pending comment"
                    >
                      Discard
                    </button>
                  )}
                </div>
                {(() => {
                  const suggestionContent = parseSuggestionBody(comment.body);
                  if (suggestionContent !== null) {
                    // Accept writes a real commit to the PR head branch via
                    // the GitHub API. For a pending (not yet submitted)
                    // suggestion, there's no posted comment to reference and
                    // the line range can be stale — accepting would commit
                    // blind. Hide the button until the review is submitted.
                    const canAccept = !!onAccept && !comment.pending;
                    return (
                      <div className="mt-1">
                        <div className="text-[9px] text-[var(--accent)] font-medium mb-1">Suggested change:</div>
                        <div className="text-[11px] font-mono bg-[var(--accent-muted)] text-[var(--text-primary)] px-2 py-1.5 rounded border border-[var(--accent)] leading-relaxed whitespace-pre-wrap">
                          {suggestionContent}
                        </div>
                        {canAccept ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); onAccept!(comment.id); }}
                            className="flex items-center gap-1 text-[10px] mt-1.5 px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
                          >
                            <Check size={10} />
                            Accept suggestion
                          </button>
                        ) : comment.pending ? (
                          <p
                            className="text-[9px] text-[var(--text-muted)] mt-1.5 italic"
                            title="Finish your review to post this suggestion; then it can be accepted"
                          >
                            Submit the review first to enable Accept
                          </p>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {comment.body}
                    </p>
                  );
                })()}
              </div>

              {/* Replies */}
              {comment.replies.length > 0 && (
                <div className="border-t border-[var(--border)] px-3 py-2 space-y-1.5">
                  {comment.replies.map((reply, ri) => (
                    <div key={ri}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[8px] font-medium"
                          style={{ backgroundColor: reply.avatarColor }}
                        >
                          {reply.author[0].toUpperCase()}
                        </div>
                        <span className="text-[10px] font-medium text-[var(--text-primary)]">
                          {reply.author}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed ml-5">
                        {reply.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input + resolve */}
              {activeCommentId === comment.id && (
                <div
                  className="border-t border-[var(--border)] px-3 py-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={replyText[comment.id] || ""}
                      onChange={(e) =>
                        setReplyText((prev) => ({ ...prev, [comment.id]: e.target.value }))
                      }
                      placeholder="Reply..."
                      className="flex-1 text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && replyText[comment.id]?.trim()) {
                          onReply(comment.id, replyText[comment.id]);
                          setReplyText((prev) => ({ ...prev, [comment.id]: "" }));
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (replyText[comment.id]?.trim()) {
                          onReply(comment.id, replyText[comment.id]);
                          setReplyText((prev) => ({ ...prev, [comment.id]: "" }));
                        }
                      }}
                      className="p-1 text-[var(--accent)] hover:bg-[var(--accent-muted)] rounded transition-colors"
                    >
                      <Send size={12} />
                    </button>
                  </div>
                  <button
                    onClick={() => onResolve(comment.id)}
                    className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-green-600 mt-1.5 transition-colors"
                  >
                    <Check size={10} />
                    Resolve
                  </button>
                </div>
              )}
            </div>
          ))}

        {/* Resolved comments */}
        {comments.some((c) => c.resolved) && (
          <div className="pt-2 border-t border-[var(--border)]">
            <p className="text-[10px] text-[var(--text-muted)] mb-1.5 px-1">Resolved</p>
            {comments
              .filter((c) => c.resolved)
              .map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 opacity-50 mb-1.5"
                >
                  {comment.selectedText && (
                    <div className="text-[10px] text-[var(--text-muted)] font-mono line-clamp-1 mb-1">
                      &ldquo;{comment.selectedText}&rdquo;
                    </div>
                  )}
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2">
                    {comment.body}
                  </p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
