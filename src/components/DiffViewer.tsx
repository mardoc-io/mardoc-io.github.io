"use client";

import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  parseBlocks,
  computeBlockLineRanges,
  blockToHtml as blockToHtmlRaw,
  computeWordDiff,
} from "@/lib/diff-blocks";
import { PRFile, PRComment, PendingSuggestion } from "@/types";
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
  Pencil,
  Eye,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Code,
  Link,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Strikethrough,
  Highlighter,
  FileCode,
  Minus,
  Trash2,
} from "lucide-react";
import ContextMenu from "./ContextMenu";
import { mapSelectionToLines, rewriteImageUrls, loadAuthenticatedImages, loadEmbedLocalImages } from "@/lib/github-api";
import { classifyLink } from "@/lib/link-handler";
import { useApp } from "@/lib/app-context";
import { openExternal } from "@/lib/open-external";
import { renderMermaidBlocks } from "@/lib/mermaid";
import { highlightCodeBlocks } from "@/lib/highlight";
import { useWideFormat } from "@/lib/use-wide-format";
import { isHtmlFile } from "@/lib/file-types";
import { injectSourceLineAttributes } from "@/lib/html-source-lines";
import { buildIframeSelectionScript } from "@/lib/html-selection";
import { useIsMobile } from "@/lib/use-viewport";
import BottomSheet from "./BottomSheet";
import MobileCommentButton from "./MobileCommentButton";
import { extractCommentSuggestions, mergeSuggestions } from "@/lib/suggestion-extract";
import { parseSuggestionBody } from "@/lib/suggestion-body";

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
  onReplyComment?: (commentId: string, body: string) => void;
  onSubmitSuggestions?: (suggestions: PendingSuggestion[]) => void;
  onAcceptSuggestion?: (commentId: string) => void;
  onDiscardPendingComment?: (commentId: string) => void;
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
  pending?: boolean;
}

// ─── Markdown Parsing Helpers ──────────────────────────────────────────────
//
// parseBlocks, computeBlockLineRanges, and computeWordDiff moved to
// @/lib/diff-blocks so they can be unit-tested in isolation. The
// DiffViewer wraps blockToHtml with highlightCodeBlocks (its own
// concern) to add syntax highlighting to fenced code blocks.

function blockToHtml(block: string): string {
  return highlightCodeBlocks(blockToHtmlRaw(block));
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
      // 300ms gives mobile touch events time to fire the button's
      // handler before the toolbar hides. On desktop this is
      // imperceptible; on slow phones it prevents the race between
      // selectionchange and the synthetic mousedown.
      hideTimeout.current = setTimeout(() => {
        setPos(null);
        setText("");
      }, 300);
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

  // Hidden on mobile — the native iOS/Android selection callout
  // covers this toolbar. MobileCommentButton replaces it.
  return (
    <div
      className="absolute z-40 hidden md:block"
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
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onComment(text);
          setPos(null);
          setText("");
          window.getSelection()?.removeAllRanges();
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 md:py-1.5 min-h-[44px] md:min-h-0 bg-[var(--accent)] text-white text-xs font-medium rounded-lg shadow-lg hover:bg-[var(--accent-hover)] transition-all whitespace-nowrap"
        style={{ animation: "fadeInUp 0.15s ease-out" }}
      >
        <MessageSquarePlus size={13} />
        Comment
      </button>
      <div className="w-0 h-0 mx-auto border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[var(--accent)]" />
    </div>
  );
}

// ─── Markdown Formatting Toolbar ──────────────────────────────────────────

type FormatAction = {
  icon: React.ReactNode;
  label: string;
  hotkey?: string;
  apply: (text: string, selStart: number, selEnd: number) => {
    text: string;
    selStart: number;
    selEnd: number;
  };
};

function applyWrap(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string,
  suffix: string
): { text: string; selStart: number; selEnd: number } {
  const before = text.slice(0, selStart);
  const selected = text.slice(selStart, selEnd);
  const after = text.slice(selEnd);

  if (selected) {
    const newText = before + prefix + selected + suffix + after;
    return { text: newText, selStart: selStart + prefix.length, selEnd: selEnd + prefix.length };
  }
  // No selection — insert placeholder
  const placeholder = "text";
  const newText = before + prefix + placeholder + suffix + after;
  return { text: newText, selStart: selStart + prefix.length, selEnd: selStart + prefix.length + placeholder.length };
}

function applyLinePrefix(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string
): { text: string; selStart: number; selEnd: number } {
  // Find start of current line
  const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  const lineEnd = text.indexOf("\n", selEnd);
  const actualEnd = lineEnd === -1 ? text.length : lineEnd;

  const before = text.slice(0, lineStart);
  const line = text.slice(lineStart, actualEnd);
  const after = text.slice(actualEnd);

  // Toggle: if line already starts with prefix, remove it
  if (line.startsWith(prefix)) {
    const newText = before + line.slice(prefix.length) + after;
    return { text: newText, selStart: Math.max(lineStart, selStart - prefix.length), selEnd: selEnd - prefix.length };
  }

  const newText = before + prefix + line + after;
  return { text: newText, selStart: selStart + prefix.length, selEnd: selEnd + prefix.length };
}

// Group 1: Headings
const HEADING_ACTIONS: FormatAction[] = [
  {
    icon: <Heading1 size={15} />, label: "Heading 1",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "# "),
  },
  {
    icon: <Heading2 size={15} />, label: "Heading 2",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "## "),
  },
  {
    icon: <Heading3 size={15} />, label: "Heading 3",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "### "),
  },
];

// Group 2: Inline formatting
const INLINE_ACTIONS: FormatAction[] = [
  {
    icon: <Bold size={15} />, label: "Bold", hotkey: "b",
    apply: (t, s, e) => applyWrap(t, s, e, "**", "**"),
  },
  {
    icon: <Italic size={15} />, label: "Italic", hotkey: "i",
    apply: (t, s, e) => applyWrap(t, s, e, "_", "_"),
  },
  {
    icon: <Strikethrough size={15} />, label: "Strikethrough",
    apply: (t, s, e) => applyWrap(t, s, e, "~~", "~~"),
  },
  {
    icon: <Code size={15} />, label: "Inline Code", hotkey: "e",
    apply: (t, s, e) => applyWrap(t, s, e, "`", "`"),
  },
  {
    icon: <Highlighter size={15} />, label: "Highlight",
    apply: (t, s, e) => applyWrap(t, s, e, "==", "=="),
  },
];

// Group 3: Lists
const LIST_ACTIONS: FormatAction[] = [
  {
    icon: <List size={15} />, label: "Bullet List",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "- "),
  },
  {
    icon: <ListOrdered size={15} />, label: "Numbered List",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "1. "),
  },
  {
    icon: <CheckSquare size={15} />, label: "Task List",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "- [ ] "),
  },
];

// Group 4: Block elements
const BLOCK_ACTIONS: FormatAction[] = [
  {
    icon: <Quote size={15} />, label: "Blockquote",
    apply: (t, s, e) => applyLinePrefix(t, s, e, "> "),
  },
  {
    icon: <FileCode size={15} />, label: "Code Block",
    apply: (t, s, e) => {
      const selected = t.slice(s, e);
      const before = t.slice(0, s);
      const after = t.slice(e);
      if (selected) {
        const newText = before + "```\n" + selected + "\n```" + after;
        return { text: newText, selStart: s + 4, selEnd: s + 4 + selected.length };
      }
      const newText = before + "```\n\n```" + after;
      return { text: newText, selStart: s + 4, selEnd: s + 4 };
    },
  },
  {
    icon: <Minus size={15} />, label: "Horizontal Rule",
    apply: (t, s, e) => {
      const before = t.slice(0, s);
      const after = t.slice(e);
      const newText = before + "\n---\n" + after;
      return { text: newText, selStart: s + 5, selEnd: s + 5 };
    },
  },
];

// Group 5: Link
const LINK_ACTIONS: FormatAction[] = [
  {
    icon: <Link size={15} />, label: "Add Link", hotkey: "k",
    apply: (t, s, e) => {
      const selected = t.slice(s, e);
      const before = t.slice(0, s);
      const after = t.slice(e);
      if (selected) {
        const newText = before + "[" + selected + "](url)" + after;
        const urlStart = s + selected.length + 3;
        return { text: newText, selStart: urlStart, selEnd: urlStart + 3 };
      }
      const newText = before + "[text](url)" + after;
      return { text: newText, selStart: s + 1, selEnd: s + 5 };
    },
  },
];

// All actions flat for hotkey lookup
const ALL_FORMAT_ACTIONS: FormatAction[] = [
  ...HEADING_ACTIONS, ...INLINE_ACTIONS, ...LIST_ACTIONS, ...BLOCK_ACTIONS, ...LINK_ACTIONS,
];

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[var(--border)] mx-1" />;
}

function MarkdownToolbar({
  textareaRef,
  text,
  onTextChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  text: string;
  onTextChange: (text: string) => void;
}) {
  const applyAction = useCallback(
    (action: FormatAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd } = textarea;
      const result = action.apply(text, selectionStart, selectionEnd);
      onTextChange(result.text);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.selStart, result.selEnd);
      });
    },
    [textareaRef, text, onTextChange]
  );

  const renderGroup = (actions: FormatAction[]) =>
    actions.map((action, i) => (
      <button
        key={action.label}
        onClick={(e) => { e.preventDefault(); applyAction(action); }}
        title={`${action.label}${action.hotkey ? ` (⌘${action.hotkey.toUpperCase()})` : ""}`}
        className="toolbar-btn"
      >
        {action.icon}
      </button>
    ));

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-[var(--accent)] bg-[var(--surface)]">
      {renderGroup(HEADING_ACTIONS)}
      <ToolbarDivider />
      {renderGroup(INLINE_ACTIONS)}
      <ToolbarDivider />
      {renderGroup(LIST_ACTIONS)}
      <ToolbarDivider />
      {renderGroup(BLOCK_ACTIONS)}
      <ToolbarDivider />
      {renderGroup(LINK_ACTIONS)}
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
  onAccept,
  onDiscardPending,
  onClose,
}: {
  comments: PanelComment[];
  activeCommentId: string | null;
  onSelect: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onResolve: (id: string) => void;
  onAccept?: (id: string) => void;
  onDiscardPending?: (id: string) => void;
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

// ─── Main DiffViewer ───────────────────────────────────────────────────────

export default function DiffViewer({
  file,
  repoFullName,
  baseBranch,
  headBranch,
  comments,
  onAddComment,
  onResolveComment,
  onReplyComment,
  onSubmitSuggestions,
  onAcceptSuggestion,
  onDiscardPendingComment,
}: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<"rendered" | "split" | "suggest" | "preview">("rendered");
  const [htmlViewMode, setHtmlViewMode] = useState<"rendered" | "source">("rendered");
  const [htmlShowBase, setHtmlShowBase] = useState(false);
  const fileIsHtml = isHtmlFile(file.path);
  const [showPanel, setShowPanel] = useState(true);
  const { wide, toggle: toggleWide } = useWideFormat();
  const { isEmbedded } = useApp();
  const isMobile = useIsMobile();

  // On mobile the comment panel lives in a slide-up bottom sheet
  // instead of a right-side rail. Default it closed on mobile so the
  // document has the full viewport.
  useEffect(() => {
    if (isMobile) setShowPanel(false);
  }, [isMobile]);

  // Single source of truth: comments prop from PRDetail (no local duplicate)
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [pendingCommentInput, setPendingCommentInput] = useState("");
  // Pre-computed source-line range for the pending selection — set
  // when the selection comes from the HTML review iframe (which has
  // the data-mardoc-line attributes to resolve lines exactly).
  // Markdown selections still compute the range via mapSelectionToLines
  // at submit time.
  const [pendingSelectionRange, setPendingSelectionRange] =
    useState<{ startLine: number; endLine: number } | null>(null);

  // Suggest mode state
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[]>([]);
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [showSuggestionsInPreview, setShowSuggestionsInPreview] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const htmlIframeRef = useRef<HTMLIFrameElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  // Post-render: fetch private repo images and render mermaid diagrams (markdown only).
  // Must re-run when comments change because renderBlockHtml injects highlight marks,
  // which causes React to replace the dangerouslySetInnerHTML DOM — wiping any
  // previously rendered mermaid SVGs.
  useEffect(() => {
    if (!contentRef.current || fileIsHtml) return;
    loadAuthenticatedImages(contentRef.current);
    // Load relative-path images from the local filesystem when
    // running inside the VS Code webview embed. No-op elsewhere.
    loadEmbedLocalImages(contentRef.current, file.path);
    renderMermaidBlocks(contentRef.current);
  }, [file, viewMode, fileIsHtml, comments]);

  // Listen for iframe messages (HTML file rendering):
  //   - mardoc-iframe-resize: auto-size the iframe to its content
  //   - mardoc-html-selection: user selected text inside the iframe,
  //     flow it into the pending-comment pipeline
  useEffect(() => {
    if (!fileIsHtml) return;
    const iframe = htmlIframeRef.current;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "mardoc-iframe-resize" && typeof data.height === "number" && iframe) {
        iframe.style.height = `${data.height + 20}px`;
        return;
      }

      if (data.type === "mardoc-html-selection" && typeof data.text === "string") {
        // Only accept selections from our own iframe
        if (iframe && event.source !== iframe.contentWindow) return;
        const startLine = typeof data.startLine === "number" ? data.startLine : 1;
        const endLine = typeof data.endLine === "number" ? data.endLine : startLine;
        setPendingSelection(data.text);
        setPendingSelectionRange({ startLine, endLine });
        setShowPanel(true);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fileIsHtml, htmlViewMode, htmlShowBase]);

  // Prepare HTML srcdoc with injected source-line attributes,
  // resize script, and selection listener. Source-line injection
  // tags every element with `data-mardoc-line` so that when a user
  // selects text inside the iframe, the selection script can walk
  // up to find the source line and postMessage it to the parent.
  const htmlSrcdoc = useMemo(() => {
    if (!fileIsHtml) return "";
    const raw = htmlShowBase ? file.baseContent : file.headContent;
    // Inject per-element source line attributes. Only on the head
    // (new) view — we don't need comment-target lines on the base
    // since comments always target the head revision.
    const tagged = htmlShowBase ? raw : injectSourceLineAttributes(raw);
    const resizeScript = `<script>(function(){function p(){window.parent.postMessage({type:'mardoc-iframe-resize',height:document.documentElement.scrollHeight},'*')}window.addEventListener('load',function(){setTimeout(p,100)});new MutationObserver(p).observe(document.body,{childList:true,subtree:true,attributes:true});setTimeout(p,500);setTimeout(p,2000)})()</script>`;
    // Only attach the selection listener in head view — base is
    // reference-only and shouldn't accept comments.
    const selectionScript = htmlShowBase
      ? ""
      : `<script>${buildIframeSelectionScript()}</script>`;
    const injected = resizeScript + selectionScript;
    if (tagged.includes("</body>")) return tagged.replace("</body>", `${injected}</body>`);
    return tagged + injected;
  }, [fileIsHtml, file.baseContent, file.headContent, htmlShowBase]);

  // Simple source diff for HTML files
  const htmlSourceDiff = useMemo(() => {
    if (!fileIsHtml) return [];
    const baseLines = file.baseContent.split("\n");
    const headLines = file.headContent.split("\n");
    const result: { type: "context" | "add" | "remove"; text: string }[] = [];

    // Simple line-by-line diff (good enough for source view)
    const baseSet = new Set(baseLines);
    const headSet = new Set(headLines);

    let bi = 0, hi = 0;
    while (bi < baseLines.length || hi < headLines.length) {
      if (bi < baseLines.length && hi < headLines.length && baseLines[bi] === headLines[hi]) {
        result.push({ type: "context", text: headLines[hi] });
        bi++; hi++;
      } else if (hi < headLines.length && !baseSet.has(headLines[hi])) {
        result.push({ type: "add", text: headLines[hi] });
        hi++;
      } else if (bi < baseLines.length && !headSet.has(baseLines[bi])) {
        result.push({ type: "remove", text: baseLines[bi] });
        bi++;
      } else {
        // Modified line — show as remove + add
        if (bi < baseLines.length) {
          result.push({ type: "remove", text: baseLines[bi] });
          bi++;
        }
        if (hi < headLines.length) {
          result.push({ type: "add", text: headLines[hi] });
          hi++;
        }
      }
    }
    return result;
  }, [fileIsHtml, file.baseContent, file.headContent]);

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
      replies: (c.replies || []).map((r) => ({
        author: r.author,
        avatarColor: r.avatarColor,
        body: r.body,
        createdAt: r.createdAt,
      })),
      source: c.pending ? ("local" as const) : ("github" as const),
      pending: c.pending,
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

  // Parsed head blocks with line ranges for suggest mode
  const headBlocks = useMemo(() => parseBlocks(file.headContent), [file.headContent]);
  const headBlockRanges = useMemo(
    () => computeBlockLineRanges(file.headContent, headBlocks),
    [file.headContent, headBlocks]
  );

  // Suggest mode: start editing a block
  const startEditingBlock = useCallback((blockIndex: number) => {
    setEditingBlockIndex(blockIndex);
    setEditingText(headBlocks[blockIndex]);
  }, [headBlocks]);

  // Suggest mode: queue a pending suggestion for the given block. Shared
  // between "Done" (save the user's edits) and "Delete block" (replace
  // the block with an empty suggestion — GitHub applies that as a delete).
  const queueSuggestionForBlock = useCallback(
    (blockIndex: number, editedMarkdown: string) => {
      const original = headBlocks[blockIndex];
      const range = headBlockRanges[blockIndex];
      setPendingSuggestions((prev) => {
        const filtered = prev.filter((s) => s.blockIndex !== blockIndex);
        return [
          ...filtered,
          {
            blockIndex,
            originalMarkdown: original,
            editedMarkdown,
            startLine: range.startLine,
            endLine: range.endLine,
          },
        ];
      });
    },
    [headBlocks, headBlockRanges]
  );

  // Suggest mode: save or discard edits on a block
  const finishEditingBlock = useCallback(() => {
    if (editingBlockIndex === null) return;

    const original = headBlocks[editingBlockIndex];
    if (editingText.trim() !== original.trim()) {
      queueSuggestionForBlock(editingBlockIndex, editingText);
    }

    setEditingBlockIndex(null);
    setEditingText("");
  }, [editingBlockIndex, editingText, headBlocks, queueSuggestionForBlock]);

  // Suggest mode: queue an empty-suggestion delete for the block currently
  // being edited. GitHub applies an empty suggestion body as a delete of
  // the referenced lines — no special API call required.
  const deleteEditingBlock = useCallback(() => {
    if (editingBlockIndex === null) return;
    queueSuggestionForBlock(editingBlockIndex, "");
    setEditingBlockIndex(null);
    setEditingText("");
  }, [editingBlockIndex, queueSuggestionForBlock]);

  // Suggest mode: discard a pending suggestion
  const discardSuggestion = useCallback((blockIndex: number) => {
    setPendingSuggestions((prev) => prev.filter((s) => s.blockIndex !== blockIndex));
  }, []);

  // Suggest mode: submit all pending suggestions
  const submitSuggestions = useCallback(() => {
    if (pendingSuggestions.length === 0) return;
    onSubmitSuggestions?.(pendingSuggestions);
    setPendingSuggestions([]);
  }, [pendingSuggestions, onSubmitSuggestions]);

  // Extract already-submitted suggestions from PR comments, mapped back to
  // blocks via line numbers (the mapping logic is pure and tested in
  // suggestion-extract.test.ts). This replaces a previous broken version
  // that mapped via `comment.selectedText`, which is only set on local
  // optimistic copies — so submitted suggestions disappeared the moment the
  // refetch replaced local state with fresh data from GitHub.
  const commentSuggestions = useMemo(() => {
    return extractCommentSuggestions(comments, headBlocks, headBlockRanges);
  }, [comments, headBlocks, headBlockRanges]);

  // All suggestions: pending local + already submitted as comments.
  const allSuggestions = useMemo(
    () => mergeSuggestions(pendingSuggestions, commentSuggestions),
    [pendingSuggestions, commentSuggestions]
  );

  // Preview mode: apply suggestions to produce preview content
  const previewBlocks = useMemo(() => {
    if (!showSuggestionsInPreview || allSuggestions.length === 0) {
      return headBlocks;
    }
    return headBlocks.map((block, idx) => {
      const suggestion = allSuggestions.find((s) => s.blockIndex === idx);
      return suggestion ? suggestion.editedMarkdown : block;
    });
  }, [headBlocks, allSuggestions, showSuggestionsInPreview]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (editingBlockIndex !== null && editTextareaRef.current) {
      editTextareaRef.current.focus();
    }
  }, [editingBlockIndex]);

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

  // Handle "Suggest change" from context menu — switch to suggest mode
  // and find + open the block containing the selected text
  const handleSuggestFromContext = useCallback((text: string) => {
    setViewMode("suggest");
    const blockIdx = headBlocks.findIndex((block) => block.includes(text));
    if (blockIdx !== -1) {
      setTimeout(() => startEditingBlock(blockIdx), 50);
    }
  }, [headBlocks, startEditingBlock]);

  const submitSelectionComment = useCallback(() => {
    if (!pendingSelection || !pendingCommentInput.trim()) return;

    // If we already have a source-line range (from the HTML iframe
    // selection listener — which resolves lines exactly via
    // data-mardoc-line attributes), trust it. Otherwise fall back
    // to fuzzy-matching the selected text against the source, which
    // is how the markdown flow has always worked.
    const { startLine, endLine } =
      pendingSelectionRange ??
      mapSelectionToLines(file.headContent, pendingSelection);

    // Let PRDetail handle state + GitHub API — it flows back through the comments prop
    onAddComment(0, pendingCommentInput.trim(), pendingSelection, startLine, endLine);

    setPendingSelection(null);
    setPendingSelectionRange(null);
    setPendingCommentInput("");
  }, [
    pendingSelection,
    pendingSelectionRange,
    pendingCommentInput,
    file.headContent,
    onAddComment,
  ]);

  const handleReply = useCallback((commentId: string, body: string) => {
    if (onReplyComment) {
      onReplyComment(commentId, body);
    }
  }, [onReplyComment]);

  const handleResolve = useCallback((commentId: string) => {
    onResolveComment(commentId);
    setActiveCommentId(null);
  }, [onResolveComment]);

  // Scroll-to-mark behaviour when the user taps a comment in the
  // panel. Shared between the desktop right-rail and the mobile sheet
  // so the flows don't diverge.
  const handleCommentSelect = useCallback((id: string) => {
    setActiveCommentId(id);
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
  }, [allPanelComments]);

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

    // Check for link clicks first
    const anchor = target.closest("a");
    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href) {
        e.preventDefault();
        e.stopPropagation();
        const type = classifyLink(href);
        if (type === "anchor") {
          const id = href.slice(1);
          const el = contentRef.current?.querySelector(`[id="${id}"]`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        } else if (type === "external") {
          openExternal(href, isEmbedded);
        }
        // Relative links don't apply in diff view — ignore
        return;
      }
    }

    // Check for comment highlight clicks
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
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap md:flex-nowrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-mono text-[var(--text-secondary)] truncate">{file.path}</span>
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

          {fileIsHtml ? (
            <div className="flex items-center gap-1 bg-[var(--surface-secondary)] rounded-md p-0.5">
              <button
                onClick={() => setHtmlViewMode("rendered")}
                className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                  htmlViewMode === "rendered"
                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <Eye size={10} />
                Rendered
              </button>
              <button
                onClick={() => setHtmlViewMode("source")}
                className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                  htmlViewMode === "source"
                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <FileCode size={10} />
                Source Diff
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-[var(--surface-secondary)] rounded-md p-0.5">
              <button
                onClick={() => setViewMode("rendered")}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  viewMode === "rendered"
                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Inline Diff
              </button>
              <button
                onClick={() => setViewMode("split")}
                className={`text-xs px-2.5 py-1 rounded transition-colors hidden md:block ${
                  viewMode === "split"
                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Side by Side
              </button>
              <button
                onClick={() => setViewMode("suggest")}
                className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                  viewMode === "suggest"
                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <Pencil size={10} />
                Suggest
                {pendingSuggestions.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0 text-[9px] rounded-full bg-[var(--accent)] text-white font-medium">
                    {pendingSuggestions.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setViewMode("preview")}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  viewMode === "preview"
                    ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Preview
              </button>
            </div>
          )}
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
                    setPendingSelectionRange(null);
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
                  setPendingSelectionRange(null);
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
          {fileIsHtml ? (
            /* HTML file rendering */
            htmlViewMode === "rendered" ? (
              <div className="h-full flex flex-col">
                {/* Base/Head toggle for rendered HTML */}
                {file.baseContent && file.headContent && (
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary,var(--surface))]">
                    <span className="text-[10px] text-[var(--text-muted)]">Showing:</span>
                    <button
                      onClick={() => setHtmlShowBase(false)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        !htmlShowBase
                          ? "bg-[var(--diff-add)] text-[var(--diff-add-text)] font-medium"
                          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      Head (new)
                    </button>
                    <button
                      onClick={() => setHtmlShowBase(true)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        htmlShowBase
                          ? "bg-[var(--diff-remove)] text-[var(--diff-remove-text)] font-medium"
                          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      Base (old)
                    </button>
                  </div>
                )}
                <div className="flex-1 overflow-auto">
                  <iframe
                    ref={htmlIframeRef}
                    srcDoc={htmlSrcdoc}
                    sandbox="allow-scripts allow-same-origin"
                    title={file.path}
                    className="w-full border-0"
                    style={{ minHeight: "100%", height: "100%" }}
                  />
                </div>
              </div>
            ) : (
              /* Source diff for HTML files */
              <div className={wide ? "mx-auto px-12 py-6" : "max-w-5xl mx-auto px-8 py-6"}>
                <div className="text-[10px] text-[var(--text-muted)] mb-4">
                  Raw HTML source diff — switch to Rendered to see the visual output
                </div>
                <pre className="text-xs font-mono leading-relaxed">
                  {htmlSourceDiff.map((line, idx) => (
                    <div
                      key={idx}
                      className={
                        line.type === "add"
                          ? "bg-[var(--diff-add)] text-[var(--diff-add-text)]"
                          : line.type === "remove"
                          ? "bg-[var(--diff-remove)] text-[var(--diff-remove-text)]"
                          : ""
                      }
                    >
                      <span className="inline-block w-4 text-[var(--text-muted)] select-none">
                        {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                      </span>
                      {line.text}
                    </div>
                  ))}
                </pre>
              </div>
            )
          ) : viewMode === "rendered" ? (
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
                onSuggestChange={handleSuggestFromContext}
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
          ) : viewMode === "split" ? (
            /* Split view — with commenting support */
            <div className="relative h-full" ref={contentRef}>
              <FloatingToolbar
                containerRef={contentRef}
                onComment={handleSelectionComment}
              />
              <ContextMenu
                containerRef={contentRef}
                onComment={handleSelectionComment}
                onSuggestChange={handleSuggestFromContext}
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
          ) : viewMode === "suggest" ? (
            /* Suggest — editable blocks, click to edit raw markdown */
            <div className="relative" ref={contentRef}>
              <div className={wide ? "mx-auto px-12 py-6" : "max-w-5xl mx-auto px-8 py-6"}>
                <div className="text-[10px] text-[var(--text-muted)] mb-4 flex items-center gap-1.5">
                  <Pencil size={10} />
                  Click any block to edit — changes become suggestions on the PR
                </div>

                {headBlocks.map((block, idx) => {
                  // allSuggestions includes both in-progress local edits and
                  // already-submitted suggestions fetched from GitHub, so the
                  // highlight survives the refetch after submit.
                  const suggestionForBlock = allSuggestions.find((s) => s.blockIndex === idx);
                  const hasSuggestion = !!suggestionForBlock;
                  // Only locally-pending suggestions can be discarded — ones
                  // that are already on GitHub need to be deleted on the PR,
                  // not removed from local state.
                  const isLocalPending = pendingSuggestions.some((s) => s.blockIndex === idx);
                  const isEditing = editingBlockIndex === idx;

                  if (isEditing) {
                    return (
                      <div key={idx} className="mb-2 rounded-lg border-2 border-[var(--accent)] bg-[var(--surface)] overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--accent-muted)] border-b border-[var(--accent)]">
                          <span className="text-[10px] text-[var(--accent)] font-medium">
                            Editing block — Lines {headBlockRanges[idx].startLine}–{headBlockRanges[idx].endLine}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={finishEditingBlock}
                              className="text-[10px] px-2 py-0.5 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] transition-colors"
                            >
                              Done
                            </button>
                            <button
                              onClick={deleteEditingBlock}
                              className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                              title="Suggest deleting this block"
                            >
                              <Trash2 size={10} />
                              Delete
                            </button>
                            <button
                              onClick={() => { setEditingBlockIndex(null); setEditingText(""); }}
                              className="text-[10px] px-2 py-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        <MarkdownToolbar
                          textareaRef={editTextareaRef}
                          text={editingText}
                          onTextChange={setEditingText}
                        />
                        <textarea
                          ref={editTextareaRef}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setEditingBlockIndex(null);
                              setEditingText("");
                              return;
                            }
                            if (e.key === "Enter" && e.metaKey) {
                              finishEditingBlock();
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
                                  editingText,
                                  textarea.selectionStart,
                                  textarea.selectionEnd,
                                  e.key,
                                  surroundPairs[e.key]
                                );
                                setEditingText(result.text);
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
                                  editingText,
                                  textarea.selectionStart,
                                  textarea.selectionEnd
                                );
                                setEditingText(result.text);
                                requestAnimationFrame(() => {
                                  textarea.setSelectionRange(result.selStart, result.selEnd);
                                });
                              }
                            }
                          }}
                          className="w-full p-3 text-sm font-mono bg-[var(--surface)] text-[var(--text-primary)] border-none outline-none resize-y min-h-[80px]"
                          rows={Math.max(3, editingText.split("\n").length + 1)}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={idx}
                      onClick={() => startEditingBlock(idx)}
                      className={`group relative mb-1 cursor-pointer rounded-md transition-all ${
                        hasSuggestion
                          ? "border-l-3 border-[var(--accent)] pl-3 bg-[var(--accent-muted)]"
                          : "hover:bg-[var(--surface-hover)] hover:outline hover:outline-1 hover:outline-[var(--border)]"
                      }`}
                    >
                      {hasSuggestion && (
                        <div className="flex items-center justify-between py-1">
                          <span className="text-[9px] text-[var(--accent)] font-medium flex items-center gap-1">
                            <Pencil size={8} />
                            {isLocalPending ? "Suggested change" : "Submitted suggestion"}
                          </span>
                          {isLocalPending && (
                            <button
                              onClick={(e) => { e.stopPropagation(); discardSuggestion(idx); }}
                              className="text-[9px] text-[var(--text-muted)] hover:text-red-500 transition-colors"
                            >
                              Discard
                            </button>
                          )}
                        </div>
                      )}
                      <div
                        className="rendered-block diff-content"
                        dangerouslySetInnerHTML={{
                          __html: hasSuggestion
                            ? headBlockToHtml(suggestionForBlock!.editedMarkdown)
                            : headBlockToHtml(block),
                        }}
                      />
                      {!hasSuggestion && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                            Click to edit
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Submit bar */}
                {pendingSuggestions.length > 0 && (
                  <div className="sticky bottom-0 mt-4 p-3 bg-[var(--surface)] border border-[var(--accent)] rounded-lg shadow-lg flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {pendingSuggestions.length} pending suggestion{pendingSuggestions.length > 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPendingSuggestions([])}
                        className="text-xs px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        Discard all
                      </button>
                      <button
                        onClick={submitSuggestions}
                        className="text-xs px-4 py-1.5 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] transition-colors font-medium"
                      >
                        Submit suggestions
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Preview — clean render with optional suggestions applied */
            <div className="relative" ref={contentRef}>
              <FloatingToolbar
                containerRef={contentRef}
                onComment={handleSelectionComment}
              />
              <ContextMenu
                containerRef={contentRef}
                onComment={handleSelectionComment}
                onSuggestChange={handleSuggestFromContext}
              />

              <div className={wide ? "mx-auto px-12 py-6" : "max-w-5xl mx-auto px-8 py-6"}>
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5">
                    <MessageSquarePlus size={10} />
                    Select any text to add a comment — all comments appear in the right panel
                  </div>
                  {allSuggestions.length > 0 && (
                    <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showSuggestionsInPreview}
                        onChange={(e) => setShowSuggestionsInPreview(e.target.checked)}
                        className="rounded border-[var(--border)] text-[var(--accent)] w-3 h-3"
                      />
                      <Eye size={10} />
                      Show suggestions ({allSuggestions.length})
                    </label>
                  )}
                </div>

                <div className="diff-content">
                  {previewBlocks.map((block, idx) => {
                    const hasSuggestion = showSuggestionsInPreview && allSuggestions.some((s) => s.blockIndex === idx);
                    return (
                      <div
                        key={idx}
                        className={`rendered-block mb-1 ${hasSuggestion ? "border-l-2 border-[var(--accent)] pl-3 bg-[var(--accent-muted)] rounded-r" : ""}`}
                        dangerouslySetInnerHTML={{
                          __html: renderBlockHtml(headBlockToHtml(block)),
                        }}
                        onClick={handleMarkClick}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Comment panel — right-side rail on desktop. On mobile it
            gets rendered below inside a BottomSheet instead. */}
        {showPanel && !isMobile && (
          <CommentPanel
            comments={allPanelComments}
            activeCommentId={activeCommentId}
            onSelect={handleCommentSelect}
            onReply={handleReply}
            onResolve={handleResolve}
            onAccept={onAcceptSuggestion}
            onDiscardPending={onDiscardPendingComment}
            onClose={() => {
              setShowPanel(false);
              setActiveCommentId(null);
            }}
          />
        )}
      </div>

      {/* Mobile: comment panel lives in a slide-up sheet */}
      {isMobile && (
        <BottomSheet
          open={showPanel}
          onClose={() => {
            setShowPanel(false);
            setActiveCommentId(null);
          }}
          ariaLabel="Comments"
        >
          <CommentPanel
            comments={allPanelComments}
            activeCommentId={activeCommentId}
            onSelect={handleCommentSelect}
            onReply={handleReply}
            onResolve={handleResolve}
            onAccept={onAcceptSuggestion}
            onDiscardPending={onDiscardPendingComment}
            onClose={() => {
              setShowPanel(false);
              setActiveCommentId(null);
            }}
          />
        </BottomSheet>
      )}

      {/* Mobile: fixed "Comment on selection" button at the bottom of
          the viewport. Replaces the FloatingToolbar which is hidden on
          mobile because the native OS selection callout covers it. */}
      {isMobile && (
        <MobileCommentButton
          containerRef={contentRef}
          onComment={handleSelectionComment}
        />
      )}
    </div>
  );
}
