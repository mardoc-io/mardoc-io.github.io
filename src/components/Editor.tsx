"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import BaseImage from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import Typography from "@tiptap/extension-typography";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import Showdown from "showdown";
import { createTurndownService } from "@/lib/turndown";

const lowlight = createLowlight(common);

// Extend TipTap Image to preserve data attributes needed for round-trip fidelity
const Image = BaseImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-mermaid-source": { default: null, parseHTML: (el) => el.getAttribute("data-mermaid-source"), renderHTML: (attrs) => attrs["data-mermaid-source"] ? { "data-mermaid-source": attrs["data-mermaid-source"] } : {} },
      "data-original-src": { default: null, parseHTML: (el) => el.getAttribute("data-original-src"), renderHTML: (attrs) => attrs["data-original-src"] ? { "data-original-src": attrs["data-original-src"] } : {} },
      "data-gh-owner": { default: null, parseHTML: (el) => el.getAttribute("data-gh-owner"), renderHTML: (attrs) => attrs["data-gh-owner"] ? { "data-gh-owner": attrs["data-gh-owner"] } : {} },
      "data-gh-repo": { default: null, parseHTML: (el) => el.getAttribute("data-gh-repo"), renderHTML: (attrs) => attrs["data-gh-repo"] ? { "data-gh-repo": attrs["data-gh-repo"] } : {} },
      "data-gh-ref": { default: null, parseHTML: (el) => el.getAttribute("data-gh-ref"), renderHTML: (attrs) => attrs["data-gh-ref"] ? { "data-gh-ref": attrs["data-gh-ref"] } : {} },
      "data-gh-path": { default: null, parseHTML: (el) => el.getAttribute("data-gh-path"), renderHTML: (attrs) => attrs["data-gh-path"] ? { "data-gh-path": attrs["data-gh-path"] } : {} },
    };
  },
});

import { rewriteImageUrls, loadAuthenticatedImages, createReviewPR, createInlineComment, mapSelectionToLines, fetchFileContent, createFileAsPR, commitFileToPRBranch } from "@/lib/github-api";
import { classifyLink, resolvePath, findFileByPath } from "@/lib/link-handler";
import { useApp } from "@/lib/app-context";
import { openExternal } from "@/lib/open-external";
import { preRenderMermaid } from "@/lib/mermaid";
import { useWideFormat } from "@/lib/use-wide-format";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  Highlighter,
  FileCode,
  MessageSquarePlus,
  MessageSquare,
  Send,
  X,
  Check as CheckIcon,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  GitPullRequest,
  ExternalLink,
  Loader2,
  FilePlus,
  FileText,
  Save,
  Pencil,
  Trash2,
  Unlink,
} from "lucide-react";

interface EditorProps {
  content: string;
  onContentChange?: (markdown: string) => void;
  filePath: string;
  repoFullName?: string;
  branch?: string;
}

interface EditorComment {
  id: string;
  selectedText: string;
  body: string;
  author: string;
  avatarColor: string;
  createdAt: string;
  resolved: boolean;
  replies: { author: string; avatarColor: string; body: string; createdAt: string }[];
}

// Use showdown for robust markdown → HTML conversion
const showdownConverter = new Showdown.Converter({
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

function markdownToHtml(md: string, repoFullName?: string, branch?: string, filePath?: string): string {
  const html = showdownConverter.makeHtml(md);
  if (repoFullName && branch && filePath) {
    return rewriteImageUrls(html, repoFullName, branch, filePath);
  }
  return html;
}

function ToolbarButton({
  onClick,
  isActive,
  icon: Icon,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  icon: React.ComponentType<any>;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`toolbar-btn ${isActive ? "active" : ""}`}
      title={title}
    >
      <Icon size={15} />
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[var(--border)] mx-1" />;
}

// ─── Floating Comment Button ──────────────────────────────────────────────

function FloatingCommentButton({
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
      }, 200);
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
      top: rect.top - containerRect.top - 40,
      left: rect.left - containerRect.left + rect.width / 2 - 55,
    });
    setText(selected);
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener("mouseup", checkSelection);
    document.addEventListener("keyup", checkSelection);
    return () => {
      document.removeEventListener("mouseup", checkSelection);
      document.removeEventListener("keyup", checkSelection);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, [checkSelection]);

  if (!pos || !text) return null;

  return (
    <div
      className="absolute z-50"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          onComment(text);
          setPos(null);
          setText("");
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-medium rounded-lg shadow-lg hover:bg-[var(--accent-hover)] transition-colors"
        style={{ animation: "fadeInUp 0.12s ease-out" }}
      >
        <MessageSquarePlus size={12} />
        Comment
      </button>
    </div>
  );
}

// ─── Link / Image Edit Bubble ───────────────────────────────────────────

interface BubbleTarget {
  type: "link" | "image";
  href: string;
  alt?: string;
  element: HTMLElement;
}

function LinkImageBubble({
  containerRef,
  editor,
  target,
  onDismiss,
  onFollowLink,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  editor: ReturnType<typeof useEditor>;
  target: BubbleTarget | null;
  onDismiss: () => void;
  onFollowLink: (href: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editUrl, setEditUrl] = useState("");
  const [editAlt, setEditAlt] = useState("");
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Reset edit state when target changes
  useEffect(() => {
    setEditing(false);
  }, [target]);

  // Dismiss on Escape or click outside
  useEffect(() => {
    if (!target) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
        setEditing(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener("keydown", handleKey);
    // Use setTimeout so the current click doesn't immediately dismiss
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClickOutside);
      clearTimeout(timer);
    };
  }, [target, onDismiss]);

  if (!target || !editor) return null;

  const container = containerRef.current;
  if (!container) return null;

  // Dismiss if the target element was removed from the DOM (stale ref)
  if (!document.contains(target.element)) {
    // Can't call onDismiss during render — schedule it
    requestAnimationFrame(onDismiss);
    return null;
  }

  const rect = target.element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const bubbleWidth = 280;
  const top = rect.bottom - containerRect.top + 6;
  const rawLeft = rect.left - containerRect.left + rect.width / 2 - bubbleWidth / 2;
  const left = Math.max(0, Math.min(rawLeft, containerRect.width - bubbleWidth));

  const startEdit = () => {
    setEditUrl(target.href);
    setEditAlt(target.alt || "");
    setEditing(true);
  };

  const applyEdit = () => {
    if (target.type === "link") {
      // Update the link href — select the link node, then set new href
      const { from, to } = editor.state.selection;
      editor.chain().focus()
        .extendMarkRange("link")
        .setLink({ href: editUrl })
        .run();
      // Restore selection position
      editor.commands.setTextSelection({ from, to });
    } else {
      // Update image src and alt
      editor.chain().focus()
        .setImage({ src: editUrl, alt: editAlt })
        .run();
    }
    onDismiss();
    setEditing(false);
  };

  const remove = () => {
    if (target.type === "link") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      // Delete the image node
      editor.chain().focus().deleteSelection().run();
    }
    onDismiss();
    setEditing(false);
  };

  return (
    <div
      ref={bubbleRef}
      className="absolute z-50"
      style={{ top, left, minWidth: 280 }}
    >
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl p-2"
        style={{ animation: "fadeInUp 0.1s ease-out" }}
      >
        {editing ? (
          <div className="space-y-2 p-1">
            <div>
              <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-0.5 block">
                {target.type === "link" ? "URL" : "Image URL"}
              </label>
              <input
                autoFocus
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyEdit();
                  if (e.key === "Escape") { setEditing(false); }
                }}
                className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            {target.type === "image" && (
              <div>
                <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-0.5 block">
                  Alt text
                </label>
                <input
                  type="text"
                  value={editAlt}
                  onChange={(e) => setEditAlt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyEdit();
                    if (e.key === "Escape") { setEditing(false); }
                  }}
                  className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            )}
            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                onClick={() => setEditing(false)}
                className="text-[10px] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyEdit}
                disabled={!editUrl.trim()}
                className="text-[10px] px-2.5 py-1 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-xs text-[var(--text-secondary)] font-mono truncate px-1 max-w-[180px]" title={target.href}>
              {target.type === "image" ? "🖼 " : ""}{target.href || "(no url)"}
            </span>
            <button
              onClick={startEdit}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] rounded transition-colors"
              title="Edit"
            >
              <Pencil size={13} />
            </button>
            {target.type === "link" && (
              <button
                onClick={() => { onFollowLink(target.href); onDismiss(); }}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] rounded transition-colors"
                title="Follow link"
              >
                <ExternalLink size={13} />
              </button>
            )}
            <button
              onClick={remove}
              className="p-1.5 text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--surface-hover)] rounded transition-colors"
              title={target.type === "link" ? "Remove link" : "Remove image"}
            >
              {target.type === "link" ? <Unlink size={13} /> : <Trash2 size={13} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Comment Side Panel ─────────────────────────────────────────────────

function CommentSidePanel({
  comments,
  activeId,
  onSelect,
  onReply,
  onResolve,
  onClose,
}: {
  comments: EditorComment[];
  activeId: string | null;
  onSelect: (commentId: string) => void;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onClose: () => void;
}) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const active = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  return (
    <div className="w-72 border-l border-[var(--border)] bg-[var(--surface)] flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
          <MessageSquare size={13} />
          Comments ({active.length})
        </div>
        <button onClick={onClose} className="toolbar-btn" style={{ width: 24, height: 24 }}>
          <X size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {active.length === 0 && resolved.length === 0 && (
          <div className="p-4 text-center text-xs text-[var(--text-muted)]">
            Select text in the editor and click "Comment" to start a discussion.
          </div>
        )}

        {active.map((comment) => (
          <div
            key={comment.id}
            onClick={() => onSelect(comment.id)}
            className={`border-b border-[var(--border)] p-3 cursor-pointer transition-colors hover:bg-[var(--surface-hover)] ${
              activeId === comment.id ? "bg-[var(--accent-muted)]" : ""
            }`}
          >
            {/* Quoted text */}
            <div className="text-[10px] text-[var(--accent)] bg-[var(--accent-muted)] px-2 py-1 rounded mb-2 line-clamp-2 italic">
              &ldquo;{comment.selectedText}&rdquo;
            </div>

            {/* Comment body */}
            <div className="flex items-start gap-2">
              <div
                className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-white text-[9px] font-bold mt-0.5"
                style={{ backgroundColor: comment.avatarColor }}
              >
                {comment.author[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-primary)]">
                    {comment.author}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {new Date(comment.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  {comment.body}
                </p>
              </div>
            </div>

            {/* Replies */}
            {comment.replies.map((reply, i) => (
              <div key={i} className="flex items-start gap-2 mt-2 ml-7">
                <div
                  className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-white text-[8px] font-bold"
                  style={{ backgroundColor: reply.avatarColor }}
                >
                  {reply.author[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-medium text-[var(--text-primary)]">
                    {reply.author}
                  </span>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {reply.body}
                  </p>
                </div>
              </div>
            ))}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-2 ml-7">
              {replyingTo === comment.id ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    autoFocus
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && replyText.trim()) {
                        onReply(comment.id, replyText.trim());
                        setReplyText("");
                        setReplyingTo(null);
                      }
                      if (e.key === "Escape") {
                        setReplyingTo(null);
                        setReplyText("");
                      }
                    }}
                    placeholder="Reply..."
                    className="flex-1 text-[11px] px-2 py-1 bg-[var(--surface-secondary)] border border-[var(--border)] rounded text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    onClick={() => {
                      if (replyText.trim()) {
                        onReply(comment.id, replyText.trim());
                        setReplyText("");
                        setReplyingTo(null);
                      }
                    }}
                    className="p-1 text-[var(--accent)] hover:bg-[var(--accent-muted)] rounded"
                  >
                    <Send size={10} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setReplyingTo(comment.id)}
                    className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => onResolve(comment.id)}
                    className="text-[10px] text-[var(--text-muted)] hover:text-green-500 flex items-center gap-0.5"
                  >
                    <CheckIcon size={9} />
                    Resolve
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Resolved comments */}
        {resolved.length > 0 && (
          <div className="border-t border-[var(--border)]">
            <button
              onClick={() => setShowResolved(!showResolved)}
              className="w-full px-3 py-2 flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
            >
              {showResolved ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {resolved.length} resolved
            </button>
            {showResolved &&
              resolved.map((c) => (
                <div key={c.id} className="px-3 py-2 opacity-50">
                  <div className="text-[10px] italic text-[var(--text-muted)] line-clamp-1">
                    &ldquo;{c.selectedText}&rdquo;
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{c.body}</p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Editor Component ──────────────────────────────────────────────

export default function Editor({ content, onContentChange, filePath, repoFullName, branch }: EditorProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const { isDemoMode, isEmbedded, refreshRepo, prBranchForNewFile, prNumberForNewFile, openPR, pullRequests, repoFiles, openFile } = useApp();
  const { wide, toggle: toggleWide, contentClass } = useWideFormat();
  const [comments, setComments] = useState<EditorComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [submittingPR, setSubmittingPR] = useState(false);
  const [submittedPR, setSubmittedPR] = useState<{ url: string; number: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // New file / local file state
  const isNewFile = filePath.startsWith("__new__/");
  const isLocalFile = filePath.startsWith("__local__/");
  const localFileName = isLocalFile ? filePath.replace("__local__/", "") : null;
  const [newFilePath, setNewFilePath] = useState("docs/");
  const [editFilePath, setEditFilePath] = useState("");
  const [newFileTitle, setNewFileTitle] = useState("");

  // Code view toggle
  const [codeView, setCodeView] = useState(false);
  const [codeContent, setCodeContent] = useState("");
  const codeTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Dirty tracking for existing files — compare current markdown to original
  const [isDirty, setIsDirty] = useState(false);
  const originalMarkdownRef = useRef<string | null>(null);
  const dirtyCheckTimer = useRef<ReturnType<typeof setTimeout>>();
  const [showEditPRModal, setShowEditPRModal] = useState(false);
  const [editPRTitle, setEditPRTitle] = useState("");
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [savingNewFile, setSavingNewFile] = useState(false);
  const [bubbleTarget, setBubbleTarget] = useState<BubbleTarget | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-[var(--accent)] underline" },
      }),
      Highlight,
      Typography,
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: "markdoc-table" },
      }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: markdownToHtml(content, repoFullName, branch, filePath),
    onUpdate: ({ editor }) => {
      onContentChange?.(editor.getHTML());
      if (!isNewFile && originalMarkdownRef.current !== null) {
        // Debounce the Turndown comparison to avoid running on every keystroke
        if (dirtyCheckTimer.current) clearTimeout(dirtyCheckTimer.current);
        dirtyCheckTimer.current = setTimeout(() => {
          const turndown = createTurndownService();
          const currentMd = turndown.turndown(editor.getHTML());
          setIsDirty(currentMd !== originalMarkdownRef.current);
        }, 300);
      }
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[500px]",
      },
    },
  });

  // Update content when file changes: pre-render mermaid, set content, then fetch images
  useEffect(() => {
    let cancelled = false;

    if (editor) {
      if (content) {
        const rawHtml = markdownToHtml(content, repoFullName, branch, filePath);
        preRenderMermaid(rawHtml).then((html) => {
          if (cancelled) return;
          editor.commands.setContent(html);
          // Capture baseline markdown for dirty comparison
          const turndown = createTurndownService();
          originalMarkdownRef.current = turndown.turndown(editor.getHTML());
          // Fetch private repo images after TipTap renders
          setTimeout(() => {
            if (!cancelled && editorContainerRef.current) {
              loadAuthenticatedImages(editorContainerRef.current);
            }
          }, 50);
        });
      } else {
        editor.commands.clearContent();
      }
    }

    setComments([]);
    setShowComments(false);
    setActiveCommentId(null);
    setSubmittedPR(null);
    setSubmitError(null);
    setIsDirty(false);
    setCodeView(false);
    setCodeContent("");
    if (editor) editor.setEditable(true);
    setShowEditPRModal(false);
    setEditPRTitle("");
    setBubbleTarget(null);
    setAddPopover(null);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, editor]);

  const toggleCodeView = useCallback(async () => {
    if (!editor) return;
    if (!codeView) {
      const turndown = createTurndownService();
      const html = editor.getHTML();
      const md = turndown.turndown(html);
      setCodeContent(md);
      setCodeView(true);
      editor.setEditable(false);
    } else {
      let rawHtml = showdownConverter.makeHtml(codeContent);
      if (repoFullName && branch && filePath) {
        rawHtml = rewriteImageUrls(rawHtml, repoFullName, branch, filePath);
      }
      const html = await preRenderMermaid(rawHtml);
      editor.commands.setContent(html);
      setCodeView(false);
      editor.setEditable(true);
      // Reload authenticated images after TipTap renders
      setTimeout(() => {
        if (editorContainerRef.current) {
          loadAuthenticatedImages(editorContainerRef.current);
        }
      }, 50);
    }
  }, [editor, codeView, codeContent, repoFullName, branch, filePath]);

  // Inline add link/image popover (replaces window.prompt for VS Code compat)
  const [addPopover, setAddPopover] = useState<{ type: "link" | "image"; url: string; alt: string } | null>(null);

  const addLink = useCallback(() => {
    if (!editor) return;
    setAddPopover({ type: "link", url: "", alt: "" });
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    setAddPopover({ type: "image", url: "", alt: "" });
  }, [editor]);

  const confirmAddPopover = useCallback(() => {
    if (!editor || !addPopover || !addPopover.url.trim()) return;
    if (addPopover.type === "link") {
      editor.chain().focus().setLink({ href: addPopover.url }).run();
    } else {
      editor.chain().focus().setImage({ src: addPopover.url, alt: addPopover.alt || undefined }).run();
    }
    setAddPopover(null);
  }, [editor, addPopover]);

  // Markdown formatting for code view textarea
  const wrapSelection = useCallback((prefix: string, suffix?: string) => {
    const textarea = codeTextareaRef.current;
    if (!textarea) return;
    const s = suffix ?? prefix;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = codeContent.slice(start, end);
    const replacement = `${prefix}${selected}${s}`;
    const newContent = codeContent.slice(0, start) + replacement + codeContent.slice(end);
    setCodeContent(newContent);
    setIsDirty(newContent !== originalMarkdownRef.current);
    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = end + prefix.length;
    });
  }, [codeContent]);

  const handleCodeViewKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    switch (e.key) {
      case "b":
        e.preventDefault();
        wrapSelection("**");
        break;
      case "i":
        e.preventDefault();
        wrapSelection("_");
        break;
      case "e":
        e.preventDefault();
        wrapSelection("`");
        break;
      case "k": {
        e.preventDefault();
        const textarea = codeTextareaRef.current;
        if (!textarea) return;
        const selected = codeContent.slice(textarea.selectionStart, textarea.selectionEnd);
        wrapSelection("[", `](${selected ? "" : "url"})`);
        break;
      }
    }
  }, [wrapSelection, codeContent]);

  const handleStartComment = useCallback((selectedText: string) => {
    setPendingSelection(selectedText);
    setShowComments(true);
  }, []);

  const handleSubmitComment = useCallback(() => {
    if (!pendingSelection || !commentInput.trim()) return;

    const newComment: EditorComment = {
      id: `ec-${Date.now()}`,
      selectedText: pendingSelection,
      body: commentInput.trim(),
      author: "you",
      avatarColor: "#264653",
      createdAt: new Date().toISOString(),
      resolved: false,
      replies: [],
    };

    setComments((prev) => [...prev, newComment]);
    setActiveCommentId(newComment.id);
    setPendingSelection(null);
    setCommentInput("");
  }, [pendingSelection, commentInput]);

  const handleReply = useCallback((commentId: string, body: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              replies: [
                ...c.replies,
                {
                  author: "you",
                  avatarColor: "#2a9d8f",
                  body,
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : c
      )
    );
  }, []);

  const handleResolve = useCallback((commentId: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c))
    );
  }, []);

  const handleSubmitAsPR = useCallback(async () => {
    if (!repoFullName || isDemoMode) return;

    const activeComments = comments.filter((c) => !c.resolved);
    if (activeComments.length === 0) return;

    setSubmittingPR(true);
    setSubmitError(null);

    try {
      // Build a description from the comments
      const description = activeComments
        .map((c) => `> ${c.selectedText}\n\n${c.body}`)
        .join("\n\n---\n\n");

      // Create the review PR (creates branch, appends space, opens PR)
      const pr = await createReviewPR(
        repoFullName,
        `Review comments on ${filePath}`,
        description,
        filePath
      );

      // Fetch the file content to map selections to line numbers
      const fileSource = content;

      // Post each comment as an inline review comment
      for (const comment of activeComments) {
        const { startLine, endLine } = mapSelectionToLines(fileSource, comment.selectedText);
        try {
          await createInlineComment(
            repoFullName,
            pr.number,
            comment.body,
            filePath,
            endLine,
            startLine !== endLine ? startLine : undefined
          );
        } catch {
          // If inline fails, the comment is still in the PR description
        }
      }

      setSubmittedPR(pr);
      // Refresh PR list so the new PR appears in the sidebar
      refreshRepo();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to create PR");
    } finally {
      setSubmittingPR(false);
    }
  }, [repoFullName, isDemoMode, comments, filePath, content, refreshRepo]);

  const isAddingToPR = isNewFile && !!prBranchForNewFile;

  const handleSaveNewFile = useCallback(async () => {
    if (!repoFullName || isDemoMode || !editor) return;
    if (!newFilePath.trim()) return;

    setSavingNewFile(true);
    setSubmitError(null);

    try {
      // Use code view content directly, or convert TipTap HTML to markdown
      let markdown: string;
      if (codeView) {
        markdown = codeContent;
      } else {
        const turndown = createTurndownService();
        const html = editor.getHTML();
        markdown = turndown.turndown(html);
      }

      const path = newFilePath.endsWith(".md") ? newFilePath : `${newFilePath}.md`;

      if (prBranchForNewFile) {
        // Commit directly to the PR branch
        await commitFileToPRBranch(
          repoFullName,
          prBranchForNewFile,
          path,
          markdown,
          `docs: add ${path}`
        );

        setShowNewFileModal(false);
        // Navigate back to the PR
        if (prNumberForNewFile) {
          const pr = pullRequests.find((p) => p.number === prNumberForNewFile);
          if (pr) {
            openPR(pr);
          }
        }
        refreshRepo();
      } else {
        // Create a new PR
        if (!newFileTitle.trim()) return;

        const pr = await createFileAsPR(
          repoFullName,
          path,
          markdown,
          newFileTitle,
        );

        setSubmittedPR(pr);
        setShowNewFileModal(false);
        refreshRepo();
      }
    } catch (err: any) {
      setSubmitError(err.message || "Failed to save file");
    } finally {
      setSavingNewFile(false);
    }
  }, [repoFullName, isDemoMode, editor, newFilePath, newFileTitle, prBranchForNewFile, prNumberForNewFile, pullRequests, openPR, codeView, codeContent, refreshRepo]);

  const handleSubmitEditsAsPR = useCallback(async () => {
    if (!repoFullName || isDemoMode || !editor || !editPRTitle.trim()) return;

    const commitPath = isLocalFile ? editFilePath.trim() : filePath;
    if (!commitPath || commitPath.startsWith("__local__/")) return;

    setSubmittingPR(true);
    setSubmitError(null);

    try {
      let markdown: string;
      if (codeView) {
        markdown = codeContent;
      } else {
        const turndown = createTurndownService();
        const html = editor.getHTML();
        markdown = turndown.turndown(html);
      }

      const path = commitPath.endsWith(".md") ? commitPath : `${commitPath}.md`;
      const pr = await createFileAsPR(
        repoFullName,
        path,
        markdown,
        editPRTitle,
      );

      setSubmittedPR(pr);
      setShowEditPRModal(false);
      setIsDirty(false);
      refreshRepo();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to create PR");
    } finally {
      setSubmittingPR(false);
    }
  }, [repoFullName, isDemoMode, editor, filePath, isLocalFile, editFilePath, editPRTitle, codeView, codeContent, refreshRepo]);

  // Click handler — intercept clicks on <a> and <img> tags in the editor
  const handleEditorClick = useCallback((e: React.MouseEvent) => {
    const el = e.target as HTMLElement;

    // Check for image click — show edit bubble
    const img = el.closest("img") as HTMLImageElement | null;
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      setBubbleTarget({
        type: "image",
        href: img.getAttribute("src") || "",
        alt: img.getAttribute("alt") || "",
        element: img,
      });
      return;
    }

    // Check for link click
    const anchor = el.closest("a") as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    e.preventDefault();
    e.stopPropagation();

    // Show edit bubble for the link
    setBubbleTarget({
      type: "link",
      href,
      element: anchor,
    });
  }, []);

  const followLink = useCallback((href: string) => {
    const type = classifyLink(href);

    if (type === "anchor") {
      const id = href.slice(1);
      const el = editorContainerRef.current?.querySelector(`[id="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else if (type === "relative") {
      const [pathPart] = href.split("#");
      const resolvedPath = resolvePath(filePath, pathPart);
      const file = findFileByPath(repoFiles, resolvedPath);
      if (file) {
        openFile(file);
      } else {
        const withMd = resolvedPath.endsWith(".md") ? resolvedPath : `${resolvedPath}.md`;
        const fileWithMd = findFileByPath(repoFiles, withMd);
        if (fileWithMd) {
          openFile(fileWithMd);
        }
      }
    } else {
      openExternal(href, isEmbedded);
    }
  }, [filePath, repoFiles, openFile, isEmbedded]);

  if (!editor) return null;

  const activeCount = comments.filter((c) => !c.resolved).length;

  return (
    <div className="h-full flex">
      {/* Main editor column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] px-3 py-1.5 flex items-center gap-0.5 flex-wrap">
          {!codeView && (<>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive("heading", { level: 1 })}
            icon={Heading1}
            title="Heading 1"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive("heading", { level: 2 })}
            icon={Heading2}
            title="Heading 2"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive("heading", { level: 3 })}
            icon={Heading3}
            title="Heading 3"
          />

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            icon={Bold}
            title="Bold (⌘B)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            icon={Italic}
            title="Italic (⌘I)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive("strike")}
            icon={Strikethrough}
            title="Strikethrough"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
            icon={Code}
            title="Inline Code"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive("highlight")}
            icon={Highlighter}
            title="Highlight"
          />

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            icon={List}
            title="Bullet List"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            icon={ListOrdered}
            title="Numbered List"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            isActive={editor.isActive("taskList")}
            icon={CheckSquare}
            title="Task List"
          />

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            icon={Quote}
            title="Blockquote"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            isActive={editor.isActive("codeBlock")}
            icon={FileCode}
            title="Code Block"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            icon={Minus}
            title="Horizontal Rule"
          />

          <ToolbarDivider />

          <div className="relative">
            <ToolbarButton onClick={addLink} isActive={editor.isActive("link") || addPopover?.type === "link"} icon={LinkIcon} title="Add Link" />
            <ToolbarButton onClick={addImage} isActive={addPopover?.type === "image"} icon={ImageIcon} title="Add Image" />
            {addPopover && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl p-2 min-w-[260px]" style={{ animation: "fadeInUp 0.1s ease-out" }}>
                <div className="space-y-2 p-1">
                  <div>
                    <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-0.5 block">
                      {addPopover.type === "link" ? "URL" : "Image URL"}
                    </label>
                    <input
                      autoFocus
                      type="text"
                      value={addPopover.url}
                      onChange={(e) => setAddPopover({ ...addPopover, url: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmAddPopover();
                        if (e.key === "Escape") setAddPopover(null);
                      }}
                      placeholder={addPopover.type === "link" ? "https://..." : "https://...image.png"}
                      className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  {addPopover.type === "image" && (
                    <div>
                      <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-0.5 block">
                        Alt text
                      </label>
                      <input
                        type="text"
                        value={addPopover.alt}
                        onChange={(e) => setAddPopover({ ...addPopover, alt: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmAddPopover();
                          if (e.key === "Escape") setAddPopover(null);
                        }}
                        placeholder="Description"
                        className="w-full text-xs px-2 py-1.5 rounded border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      onClick={() => setAddPopover(null)}
                      className="text-[10px] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmAddPopover}
                      disabled={!addPopover.url.trim()}
                      className="text-[10px] px-2.5 py-1 bg-[var(--accent)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                    >
                      {addPopover.type === "link" ? "Add Link" : "Add Image"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <ToolbarDivider />

          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            icon={Undo}
            title="Undo (⌘Z)"
          />
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            icon={Redo}
            title="Redo (⌘⇧Z)"
          />

          </>)}
          {codeView && (<>
          <ToolbarButton onClick={() => wrapSelection("**")} icon={Bold} title="Bold (⌘B)" />
          <ToolbarButton onClick={() => wrapSelection("_")} icon={Italic} title="Italic (⌘I)" />
          <ToolbarButton onClick={() => wrapSelection("~~")} icon={Strikethrough} title="Strikethrough" />
          <ToolbarButton onClick={() => wrapSelection("`")} icon={Code} title="Inline Code (⌘E)" />
          <ToolbarDivider />
          <ToolbarButton onClick={() => wrapSelection("[", "](url)")} icon={LinkIcon} title="Link (⌘K)" />
          <ToolbarButton onClick={() => wrapSelection("![alt](", ")")} icon={ImageIcon} title="Image" />
          </>)}
          {/* Wide format + comment toggle + submit PR — right side */}
          <div className="ml-auto flex items-center gap-1">
            {/* Save new file as PR */}
            {isNewFile && !submittedPR && (
              <button
                onClick={() => setShowNewFileModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
                title={isAddingToPR ? "Add file to PR branch" : "Save to repository as a PR"}
              >
                <Save size={13} />
                {isAddingToPR ? "Add to PR" : "Save to Repo"}
              </button>
            )}
            {/* Submit edits as PR — when file is dirty */}
            {!isNewFile && isDirty && !submittedPR && (
              <button
                onClick={() => { const repoPath = isLocalFile ? (localFileName || "") : filePath; setEditPRTitle(`${isLocalFile ? "Add" : "Update"} ${repoPath}`); setEditFilePath(repoPath); setShowEditPRModal(true); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
                title="Submit your edits as a pull request"
              >
                <GitPullRequest size={13} />
                Submit Edits as PR
              </button>
            )}
            {/* Submit comments as PR — only when authenticated and comments exist */}
            {!isNewFile && !isDemoMode && activeCount > 0 && !submittedPR && (
              <button
                onClick={handleSubmitAsPR}
                disabled={submittingPR}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                title="Submit comments as a PR review"
              >
                {submittingPR ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <GitPullRequest size={13} />
                )}
                {submittingPR ? "Creating..." : "Submit as PR"}
              </button>
            )}
            {submittedPR && (
              <a
                href={submittedPR.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                <ExternalLink size={13} />
                PR #{submittedPR.number}
              </a>
            )}
            {submitError && (
              <span className="text-xs text-red-500 px-2">{submitError}</span>
            )}
            <button
              onClick={toggleCodeView}
              className={`toolbar-btn ${codeView ? "active" : ""}`}
              title={codeView ? "Rich view" : "Code view"}
            >
              <FileCode size={15} />
            </button>
            <button
              onClick={toggleWide}
              className={`toolbar-btn ${wide ? "active" : ""}`}
              title={wide ? "Normal width" : "Wide format"}
            >
              {wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              onClick={() => setShowComments(!showComments)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                showComments
                  ? "bg-[var(--accent-muted)] text-[var(--accent)] font-medium"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              }`}
              title="Toggle comments panel"
            >
              <MessageSquare size={13} />
              {activeCount > 0 && (
                <span className="bg-[var(--accent)] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 overflow-y-auto" ref={editorContainerRef as React.RefObject<HTMLDivElement>} onClick={handleEditorClick}>
          <div className={contentClass}>
            {/* File path breadcrumb */}
            <div className="text-xs text-[var(--text-muted)] mb-4 font-mono flex items-center gap-2">
              {isNewFile ? (
                <>
                  <FilePlus size={12} className="text-[var(--accent)]" />
                  <span className="text-[var(--accent)] font-medium">New file</span>
                  {isAddingToPR ? (
                    <span className="text-[10px] opacity-60">
                      — adding to PR #{prNumberForNewFile} on <span className="font-mono">{prBranchForNewFile}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-60">
                      — write content, then save to repo as a PR
                    </span>
                  )}
                </>
              ) : isLocalFile ? (
                <>
                  <FileText size={12} className="text-[var(--accent)]" />
                  <span className="text-[var(--accent)] font-medium">{localFileName}</span>
                  <span className="text-[10px] opacity-60">
                    — local file
                  </span>
                </>
              ) : (
                <>
                  {filePath}
                  <span className="text-[10px] text-[var(--text-muted)] opacity-60">
                    — select text to comment
                  </span>
                </>
              )}
            </div>

            {/* Floating comment button */}
            <FloatingCommentButton
              containerRef={editorContainerRef}
              onComment={handleStartComment}
            />

            {/* Link / image edit bubble */}
            {!codeView && (
              <LinkImageBubble
                containerRef={editorContainerRef}
                editor={editor}
                target={bubbleTarget}
                onDismiss={() => setBubbleTarget(null)}
                onFollowLink={followLink}
              />
            )}

            {codeView ? (
              <textarea
                ref={codeTextareaRef}
                value={codeContent}
                onChange={(e) => { setCodeContent(e.target.value); setIsDirty(e.target.value !== originalMarkdownRef.current); }}
                onKeyDown={handleCodeViewKeyDown}
                className="w-full min-h-[60vh] p-4 font-mono text-sm leading-relaxed bg-[var(--surface-secondary)] text-[var(--text-primary)] border border-[var(--border)] rounded-lg resize-y focus:outline-none focus:border-[var(--accent)]"
                spellCheck={false}
              />
            ) : (
              <EditorContent editor={editor} />
            )}

            {/* Pending comment input — inline below selection */}
            {pendingSelection && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-96 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl p-4" style={{ animation: "fadeInUp 0.15s ease-out" }}>
                <div className="text-[10px] text-[var(--accent)] bg-[var(--accent-muted)] px-2.5 py-1.5 rounded mb-3 line-clamp-2 italic">
                  &ldquo;{pendingSelection}&rdquo;
                </div>
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && commentInput.trim()) {
                        handleSubmitComment();
                      }
                      if (e.key === "Escape") {
                        setPendingSelection(null);
                        setCommentInput("");
                      }
                    }}
                    placeholder="Add a comment..."
                    className="flex-1 text-sm px-3 py-2 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]"
                  />
                  <button
                    onClick={handleSubmitComment}
                    disabled={!commentInput.trim()}
                    className="p-2 bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-30 transition-colors"
                  >
                    <Send size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setPendingSelection(null);
                      setCommentInput("");
                    }}
                    className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Comment side panel */}
      {showComments && (
        <CommentSidePanel
          comments={comments}
          activeId={activeCommentId}
          onSelect={(id) => {
            setActiveCommentId(id);
            // Find the comment's selected text and scroll to it in the editor
            const comment = comments.find((c) => c.id === id);
            if (comment && editorContainerRef.current) {
              // Walk the editor DOM to find matching text
              const walker = document.createTreeWalker(
                editorContainerRef.current,
                NodeFilter.SHOW_TEXT,
                null
              );
              let node: Node | null;
              while ((node = walker.nextNode())) {
                if (node.textContent && node.textContent.includes(comment.selectedText.slice(0, 30))) {
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
          }}
          onReply={handleReply}
          onResolve={handleResolve}
          onClose={() => setShowComments(false)}
        />
      )}

      {/* New file save modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-[420px] p-5"
            style={{ animation: "fadeInUp 0.15s ease-out" }}
          >
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <GitPullRequest size={16} className="text-[var(--accent)]" />
              {isAddingToPR ? `Add File to PR #${prNumberForNewFile}` : "Save to Repository"}
            </h3>

            {isAddingToPR && (
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                Committing to branch <span className="font-mono text-[var(--text-primary)]">{prBranchForNewFile}</span>
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
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="docs/my-document.md"
                  className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] font-mono placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFilePath.trim() && (isAddingToPR || newFileTitle.trim())) {
                      handleSaveNewFile();
                    }
                  }}
                />
                {newFilePath && !newFilePath.endsWith(".md") && (
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
                    value={newFileTitle}
                    onChange={(e) => setNewFileTitle(e.target.value)}
                    placeholder={`Add ${newFilePath || "new document"}`}
                    className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newFilePath.trim() && newFileTitle.trim()) {
                        handleSaveNewFile();
                      }
                    }}
                  />
                </div>
              )}

              {isDemoMode && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 px-3 py-2 rounded-md">
                  Connect a GitHub repository in Settings to save files.
                </p>
              )}

              {submitError && (
                <p className="text-xs text-red-500">{submitError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowNewFileModal(false); setSubmitError(null); }}
                className="text-xs px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewFile}
                disabled={savingNewFile || !newFilePath.trim() || (!isAddingToPR && !newFileTitle.trim()) || isDemoMode}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                {savingNewFile ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <GitPullRequest size={13} />
                )}
                {savingNewFile ? "Committing..." : isAddingToPR ? "Commit to PR" : "Create PR"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit PR modal */}
      {showEditPRModal && (
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
              {isLocalFile
                ? "This local file will be committed on a new branch and opened as a pull request."
                : <>Your changes to <span className="font-mono text-[var(--text-primary)]">{filePath}</span> will be committed on a new branch and opened as a pull request.</>}
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
                    onChange={(e) => setEditFilePath(e.target.value)}
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
                  value={editPRTitle}
                  onChange={(e) => setEditPRTitle(e.target.value)}
                  placeholder={isLocalFile ? `Add ${editFilePath}` : `Update ${filePath}`}
                  className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editPRTitle.trim()) {
                      handleSubmitEditsAsPR();
                    }
                  }}
                />
              </div>

              {submitError && (
                <p className="text-xs text-red-500">{submitError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => { setShowEditPRModal(false); setSubmitError(null); }}
                className="text-xs px-3 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitEditsAsPR}
                disabled={submittingPR || !editPRTitle.trim() || (isLocalFile && !editFilePath.trim())}
                className="flex items-center gap-1.5 text-xs px-4 py-1.5 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                {submittingPR ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <GitPullRequest size={13} />
                )}
                {submittingPR ? "Creating..." : "Create PR"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
