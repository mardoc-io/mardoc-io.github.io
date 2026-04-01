"use client";

import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { diffWords } from "diff";
import Showdown from "showdown";
import { PRFile, PRComment } from "@/types";
import {
  MessageSquare,
  MessageSquarePlus,
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  X,
  Send,
  Maximize2,
  Minimize2,
} from "lucide-react";
import ContextMenu from "./ContextMenu";
import { mapSelectionToLines, rewriteImageUrls, loadAuthenticatedImages } from "@/lib/github-api";
import { renderMermaidBlocks } from "@/lib/mermaid";
import { useWideFormat } from "@/lib/use-wide-format";

interface DiffViewerProps {
  file: PRFile;
  repoFullName: string;
  baseBranch: string;
  headBranch: string;
  comments: PRComment[];
  onAddComment: (
    blockIndex: number,
    body: string,
    selectedText?: string,
    startLine?: number,
    endLine?: number
  ) => void;
  onResolveComment: (commentId: string) => void;
}

interface DiffBlock {
  type: "unchanged" | "added" | "removed" | "modified";
  baseText: string;
  headText: string;
  diffHtml?: string;
}

interface PanelComment {
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
}

// ─── Markdown Parsing Helpers ──────────────────────────────────────────────

function parseBlocks(md: string): string[] {
  const blocks: string[] = [];
  const lines = md.split("\n");
  let currentBlock = "";
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        currentBlock += line + "\n";
        blocks.push(currentBlock.trim());
        currentBlock = "";
        inCodeBlock = false;
      } else {
        if (currentBlock.trim()) blocks.push(currentBlock.trim());
        currentBlock = line + "\n";
        inCodeBlock = true;
      }
    } else if (inCodeBlock) {
      currentBlock += line + "\n";
    } else if (line.trim() === "") {
      if (currentBlock.trim()) {
        blocks.push(currentBlock.trim());
        currentBlock = "";
      }
    } else {
      currentBlock += line + "\n";
    }
  }
  if (currentBlock.trim()) blocks.push(currentBlock.trim());
  return blocks;
}

// Use showdown for robust markdown → HTML conversion in diff blocks
const diffShowdownConverter = new Showdown.Converter({
  tables: true,
  tasklists: true,
  strikethrough: true,
  ghCodeBlocks: true,
  simplifiedAutoLink: true,
  literalMidWordUnderscores: true,
  simpleLineBreaks: false,
  openLinksInNewWindow: true,
  emoji: true,
  ghCompatibleHeaderId: true,
});

function blockToHtml(block: string): string {
  return diffShowdownConverter.makeHtml(block);
}

function computeWordDiff(oldText: string, newText: string): string {
  const changes = diffWords(oldText, newText);
  return changes
    .map((part) => {
      if (part.added) return `<span class="diff-added">${part.value}</span>`;
      if (part.removed) return `<span class="diff-removed">${part.value}</span>`;
      return part.value;
    })
    .join("");
}

// ─── Floating Selection Toolbar ────────────────────────────────────────────

function FloatingToolbar({
  containerRef,
  onComment,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  onComment: (text: string) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [text, setText] = useState("");
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  const checkSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      hideTimeout.current = setTimeout(() => {
        setPos(null);
        setText("");
      }, 150);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setPos(null);
      return;
    }

    const selected = sel.toString().trim();
    if (selected.length < 3) return;

    if (hideTimeout.current) clearTimeout(hideTimeout.current);

    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    setPos({
      top: rect.top - containerRect.top - 42,
      left: rect.left - containerRect.left + rect.width / 2,
    });
    setText(selected);
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", checkSelection);
    return () => {
      document.removeEventListener("selectionchange", checkSelection);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [checkSelection]);

  if (!pos || !text) return null;

  return (
    <div
      className="absolute z-40"
      style={{ top: `${pos.top}px`, left: `${pos.left}px`, transform: "translateX(-50%)" }}
    >
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onComment(text);
          setPos(null);
          setText("");
          window.getSelection()?.removeAllRanges();
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-lg shadow-lg hover:bg-[var(--accent-hover)] transition-all whitespace-nowrap"
        style={{ animation: "fadeInUp 0.15s ease-out" }}
      >
        <MessageSquarePlus size={13} />
        Comment
      </button>
      <div className="w-0 h-0 mx-auto border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--accent)]" />
    </div>
  );
}

// ─── Comment Side Panel (ALL comments live here — never inline) ─────────────

function CommentPanel({
  comments,
  activeCommentId,
  onSelect,
  onReply,
  onResolve,
  onClose,
}: {
  comments: PanelComment[];
  activeCommentId: string | null;
  onSelect: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onResolve: (id: string) => void;
  onClose: () => void;
}) {
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
                  {comment.source === "github" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-muted)]">
                      GitHub
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {comment.body}
                </p>
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

// ─── Main DiffViewer ───────────────────────────────────────────────────────

export default function DiffViewer({
  file,
  repoFullName,
  baseBranch,
  headBranch,
  comments,
  onAddComment,
  onResolveComment,
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "split">("rendered");
  const [showPanel, setShowPanel] = useState(true);
  const { wide, toggle: toggleWide } = useWideFormat();

  // Single source of truth: comments prop from PRDetail (no local duplicate)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [pendingCommentInput, setPendingCommentInput] = useState("");

  const contentRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  // Post-render: fetch private repo images and render mermaid diagrams
  useEffect(() => {
    if (!contentRef.current) return;
    loadAuthenticatedImages(contentRef.current);
    renderMermaidBlocks(contentRef.current);
  }, [file, viewMode]);

  // Map PR comments into panel format for display
  const allPanelComments: PanelComment[] = useMemo(() => {
    return comments.map((c) => ({
      id: c.id,
      selectedText: c.selectedText || "",
      body: c.body,
      author: c.author,
      avatarColor: c.avatarColor,
      createdAt: c.createdAt,
      blockIndex: c.blockIndex || 0,
      resolved: c.resolved,
      replies: [],
      source: "github" as const,
    }));
  }, [comments]);

  // Auto-show panel when there are comments
  useEffect(() => {
    if (allPanelComments.filter((c) => !c.resolved).length > 0) {
      setShowPanel(true);
    }
  }, [allPanelComments]);

  // Focus input when pending selection is set
  useEffect(() => {
    if (pendingSelection && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [pendingSelection]);

  // Render markdown block to HTML with repo-relative image URLs resolved
  const baseBlockToHtml = useCallback(
    (block: string) =>
      repoFullName
        ? rewriteImageUrls(blockToHtml(block), repoFullName, baseBranch, file.path)
        : blockToHtml(block),
    [repoFullName, baseBranch, file.path]
  );

  const headBlockToHtml = useCallback(
    (block: string) =>
      repoFullName
        ? rewriteImageUrls(blockToHtml(block), repoFullName, headBranch, file.path)
        : blockToHtml(block),
    [repoFullName, headBranch, file.path]
  );

  const diffBlocks = useMemo(() => {
    const baseBlocks = parseBlocks(file.baseContent);
    const headBlocks = parseBlocks(file.headContent);
    const result: DiffBlock[] = [];
    let bi = 0;
    let hi = 0;

    while (bi < baseBlocks.length || hi < headBlocks.length) {
      if (bi >= baseBlocks.length) {
        result.push({ type: "added", baseText: "", headText: headBlocks[hi] });
        hi++;
      } else if (hi >= headBlocks.length) {
        result.push({ type: "removed", baseText: baseBlocks[bi], headText: "" });
        bi++;
      } else if (baseBlocks[bi] === headBlocks[hi]) {
        result.push({ type: "unchanged", baseText: baseBlocks[bi], headText: headBlocks[hi] });
        bi++;
        hi++;
      } else {
        const headLookAhead = headBlocks.slice(hi, hi + 5).indexOf(baseBlocks[bi]);
        const baseLookAhead = baseBlocks.slice(bi, bi + 5).indexOf(headBlocks[hi]);

        if (headLookAhead > 0 && (baseLookAhead === -1 || headLookAhead <= baseLookAhead)) {
          for (let i = 0; i < headLookAhead; i++) {
            result.push({ type: "added", baseText: "", headText: headBlocks[hi + i] });
          }
          hi += headLookAhead;
        } else if (baseLookAhead > 0) {
          for (let i = 0; i < baseLookAhead; i++) {
            result.push({ type: "removed", baseText: baseBlocks[bi + i], headText: "" });
          }
          bi += baseLookAhead;
        } else {
          result.push({
            type: "modified",
            baseText: baseBlocks[bi],
            headText: headBlocks[hi],
            diffHtml: computeWordDiff(baseBlocks[bi], headBlocks[hi]),
          });
          bi++;
          hi++;
        }
      }
    }
    return result;
  }, [file]);

  // Handle text selection → comment
  const handleSelectionComment = useCallback((text: string) => {
    setPendingSelection(text);
    setShowPanel(true);
  }, []);

  const submitSelectionComment = useCallback(() => {
    if (!pendingSelection || !pendingCommentInput.trim()) return;

    // Map selected text to line numbers in the head content
    const { startLine, endLine } = mapSelectionToLines(file.headContent, pendingSelection);

    // Let PRDetail handle state + GitHub API — it flows back through the comments prop
    onAddComment(0, pendingCommentInput.trim(), pendingSelection, startLine, endLine);

    setPendingSelection(null);
    setPendingCommentInput("");
  }, [pendingSelection, pendingCommentInput, file.headContent, onAddComment]);

  const handleReply = useCallback((commentId: string, body: string) => {
    // For now, replies are handled locally in the panel
    // TODO: wire to GitHub API for reply threading
    console.log("Reply to", commentId, body);
  }, []);

  const handleResolve = useCallback((commentId: string) => {
    onResolveComment(commentId);
    setActiveCommentId(null);
  }, [onResolveComment]);

  // Render block content with highlighted commented text
  const renderBlockHtml = useCallback(
    (rawHtml: string) => {
      const activeComments = allPanelComments.filter((c) => !c.resolved && c.selectedText);
      if (activeComments.length === 0) return rawHtml;

      const matches: { start: number; end: number; commentId: string }[] = [];

      for (const sc of activeComments) {
        const escapedText = sc.selectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escapedText, "gi");
        let match: RegExpExecArray | null;
        while ((match = regex.exec(rawHtml)) !== null) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            commentId: sc.id,
          });
          break;
        }
      }

      if (matches.length === 0) return rawHtml;

      matches.sort((a, b) => b.start - a.start);

      const filtered: typeof matches = [];
      for (const m of matches) {
        const hasOverlap = filtered.some(
          (existing) => m.start < existing.end && m.end > existing.start
        );
        if (!hasOverlap) filtered.push(m);
      }

      let html = rawHtml;
      for (const m of filtered) {
        const original = html.slice(m.start, m.end);
        html =
          html.slice(0, m.start) +
          `<mark class="selection-comment-highlight" data-comment-id="${m.commentId}">${original}</mark>` +
          html.slice(m.end);
      }

      return html;
    },
    [allPanelComments]
  );

  const handleMarkClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const mark = target.closest("[data-comment-id]");
    if (mark) {
      const id = mark.getAttribute("data-comment-id");
      if (id) {
        setActiveCommentId(id);
        setShowPanel(true);
      }
    }
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-[var(--text-secondary)]">{file.path}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              file.status === "added"
                ? "bg-[var(--diff-add)] text-[var(--diff-add-text)]"
                : file.status === "deleted"
                ? "bg-[var(--diff-remove)] text-[var(--diff-remove-text)]"
                : "bg-[var(--accent-muted)] text-[var(--accent)]"
            }`}
          >
            {file.status}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Comment count + toggle */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            className={`flex items-center gap-1 text-xs transition-colors ${
              showPanel ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--accent)]"
            }`}
          >
            <MessageSquare size={12} />
            {allPanelComments.filter((c) => !c.resolved).length > 0
              ? `${allPanelComments.filter((c) => !c.resolved).length} comment${
                  allPanelComments.filter((c) => !c.resolved).length > 1 ? "s" : ""
                }`
              : "Comments"}
          </button>

          <button
            onClick={toggleWide}
            className={`toolbar-btn ${wide ? "active" : ""}`}
            title={wide ? "Normal width" : "Wide format"}
          >
            {wide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <div className="flex items-center gap-1 bg-[var(--surface-secondary)] rounded-md p-0.5">
            <button
              onClick={() => setViewMode("rendered")}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                viewMode === "rendered"
                  ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Rendered Diff
            </button>
            <button
              onClick={() => setViewMode("split")}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                viewMode === "split"
                  ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              Side by Side
            </button>
          </div>
        </div>
      </div>

      {/* Pending selection comment input */}
      {pendingSelection && (
        <div className="bg-[var(--accent-muted)] border-b border-[var(--accent)] px-4 py-2.5 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-[var(--accent)] font-medium mb-1">
              Commenting on selected text:
            </div>
            <div className="text-xs text-[var(--text-primary)] font-mono bg-[var(--surface)] px-2 py-1 rounded border border-[var(--border)] line-clamp-2 mb-2">
              &ldquo;{pendingSelection}&rdquo;
            </div>
            <div className="flex gap-2">
              <input
                ref={commentInputRef}
                type="text"
                value={pendingCommentInput}
                onChange={(e) => setPendingCommentInput(e.target.value)}
                placeholder="Write your comment..."
                className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pendingCommentInput.trim()) {
                    submitSelectionComment();
                  }
                  if (e.key === "Escape") {
                    setPendingSelection(null);
                    setPendingCommentInput("");
                  }
                }}
              />
              <button
                onClick={submitSelectionComment}
                disabled={!pendingCommentInput.trim()}
                className="text-xs px-3 py-1.5 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
              >
                Comment
              </button>
              <button
                onClick={() => {
                  setPendingSelection(null);
                  setPendingCommentInput("");
                }}
                className="text-xs px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content + panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main diff content */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === "rendered" ? (
            <div className="relative" ref={contentRef}>
              {/* Floating selection toolbar */}
              <FloatingToolbar
                containerRef={contentRef}
                onComment={handleSelectionComment}
              />
              {/* Right-click context menu */}
              <ContextMenu
                containerRef={contentRef}
                onComment={handleSelectionComment}
              />

              <div className={wide ? "mx-auto px-12 py-6" : "max-w-5xl mx-auto px-8 py-6"}>
                {/* Hint */}
                <div className="text-[10px] text-[var(--text-muted)] mb-4 flex items-center gap-1.5">
                  <MessageSquarePlus size={10} />
                  Select any text to add a comment — all comments appear in the right panel
                </div>

                {diffBlocks.map((block, idx) => (
                  <div key={idx} className="group relative mb-1">
                    {/* Block content with highlighted selections */}
                    {block.type === "unchanged" && (
                      <div
                        className="rendered-block diff-content"
                        dangerouslySetInnerHTML={{
                          __html: renderBlockHtml(headBlockToHtml(block.headText)),
                        }}
                        onClick={handleMarkClick}
                      />
                    )}

                    {block.type === "added" && (
                      <div className="diff-block-added diff-content">
                        <div className="flex items-center gap-1 text-xs text-[var(--diff-add-text)] font-medium mb-1">
                          <Plus size={12} /> Added
                        </div>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderBlockHtml(headBlockToHtml(block.headText)),
                          }}
                          onClick={handleMarkClick}
                        />
                      </div>
                    )}

                    {block.type === "removed" && (
                      <div className="diff-block-removed diff-content">
                        <div className="flex items-center gap-1 text-xs text-[var(--diff-remove-text)] font-medium mb-1">
                          <X size={12} /> Removed
                        </div>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderBlockHtml(baseBlockToHtml(block.baseText)),
                          }}
                        />
                      </div>
                    )}

                    {block.type === "modified" && (
                      <div className="border-l-3 border-[var(--accent)] pl-4 my-2 bg-[var(--accent-muted)] rounded-r-md py-2 pr-3 diff-content">
                        <div className="flex items-center gap-1 text-xs text-[var(--accent)] font-medium mb-1">
                          Modified
                        </div>
                        <div
                          className="text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: renderBlockHtml(
                              headBlockToHtml(block.diffHtml || block.headText)
                            ),
                          }}
                          onClick={handleMarkClick}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Split view — with commenting support */
            <div className="relative h-full" ref={contentRef}>
              <FloatingToolbar
                containerRef={contentRef}
                onComment={handleSelectionComment}
              />
              <ContextMenu
                containerRef={contentRef}
                onComment={handleSelectionComment}
              />
              <div className="flex h-full">
                <div className="flex-1 border-r border-[var(--border)] overflow-y-auto">
                  <div className="px-4 py-2 text-xs text-[var(--text-muted)] bg-[var(--diff-remove)] border-b border-[var(--border)] font-medium sticky top-0">
                    base: {file.path}
                  </div>
                  <div className="p-6 diff-content">
                    {parseBlocks(file.baseContent).map((block, idx) => (
                      <div
                        key={idx}
                        className="mb-1"
                        dangerouslySetInnerHTML={{ __html: renderBlockHtml(baseBlockToHtml(block)) }}
                        onClick={handleMarkClick}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 py-2 text-xs text-[var(--text-muted)] bg-[var(--diff-add)] border-b border-[var(--border)] font-medium sticky top-0">
                    head: {file.path}
                  </div>
                  <div className="p-6 diff-content">
                    {parseBlocks(file.headContent).map((block, idx) => (
                      <div
                        key={idx}
                        className="mb-1"
                        dangerouslySetInnerHTML={{ __html: renderBlockHtml(headBlockToHtml(block)) }}
                        onClick={handleMarkClick}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Comment side panel — always available */}
        {showPanel && (
          <CommentPanel
            comments={allPanelComments}
            activeCommentId={activeCommentId}
            onSelect={(id) => {
              setActiveCommentId(id);
              // Scroll to the highlighted mark in the content area
              setTimeout(() => {
                const container = contentRef.current;
                if (!container) return;

                const mark = container.querySelector(`[data-comment-id="${id}"]`);
                if (mark) {
                  mark.scrollIntoView({ behavior: "smooth", block: "center" });
                  mark.classList.add("comment-highlight-flash");
                  setTimeout(() => mark.classList.remove("comment-highlight-flash"), 1500);
                  return;
                }

                // Fallback: find the comment's text in the DOM via tree walker
                const comment = allPanelComments.find((c) => c.id === id);
                if (comment && comment.selectedText) {
                  const searchText = comment.selectedText.slice(0, 40);
                  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
                  let node: Node | null;
                  while ((node = walker.nextNode())) {
                    if (node.textContent && node.textContent.includes(searchText)) {
                      const el = node.parentElement;
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        el.classList.add("comment-highlight-flash");
                        setTimeout(() => el.classList.remove("comment-highlight-flash"), 1500);
                      }
                      break;
                    }
                  }
                }
              }, 50);
            }}
            onReply={handleReply}
            onResolve={handleResolve}
            onClose={() => {
              setShowPanel(false);
              setActiveCommentId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
