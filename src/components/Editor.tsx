"use client";

import React, { useEffect, useCallback, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
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

const lowlight = createLowlight(common);
import { rewriteImageUrls, loadAuthenticatedImages, createReviewPR, createInlineComment, mapSelectionToLines, fetchFileContent } from "@/lib/github-api";
import { useApp } from "@/lib/app-context";
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
  const { isDemoMode, refreshRepo } = useApp();
  const { wide, toggle: toggleWide, contentClass } = useWideFormat();
  const [comments, setComments] = useState<EditorComment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [submittingPR, setSubmittingPR] = useState(false);
  const [submittedPR, setSubmittedPR] = useState<{ url: string; number: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
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

    if (editor && content) {
      const rawHtml = markdownToHtml(content, repoFullName, branch, filePath);
      preRenderMermaid(rawHtml).then((html) => {
        if (cancelled) return;
        editor.commands.setContent(html);
        // Fetch private repo images after TipTap renders
        setTimeout(() => {
          if (!cancelled && editorContainerRef.current) {
            loadAuthenticatedImages(editorContainerRef.current);
          }
        }, 50);
      });
    }

    setComments([]);
    setShowComments(false);
    setActiveCommentId(null);
    setSubmittedPR(null);
    setSubmitError(null);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Enter image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

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

  if (!editor) return null;

  const activeCount = comments.filter((c) => !c.resolved).length;

  return (
    <div className="h-full flex">
      {/* Main editor column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] px-3 py-1.5 flex items-center gap-0.5 flex-wrap">
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

          <ToolbarButton onClick={addLink} isActive={editor.isActive("link")} icon={LinkIcon} title="Add Link" />
          <ToolbarButton onClick={addImage} icon={ImageIcon} title="Add Image" />

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

          {/* Wide format + comment toggle + submit PR — right side */}
          <div className="ml-auto flex items-center gap-1">
            {/* Submit as PR — only when authenticated and comments exist */}
            {!isDemoMode && activeCount > 0 && !submittedPR && (
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
        <div className="flex-1 overflow-y-auto" ref={editorContainerRef as React.RefObject<HTMLDivElement>}>
          <div className={contentClass}>
            {/* File path breadcrumb */}
            <div className="text-xs text-[var(--text-muted)] mb-4 font-mono flex items-center gap-2">
              {filePath}
              <span className="text-[10px] text-[var(--text-muted)] opacity-60">
                — select text to comment
              </span>
            </div>

            {/* Floating comment button */}
            <FloatingCommentButton
              containerRef={editorContainerRef}
              onComment={handleStartComment}
            />

            <EditorContent editor={editor} />

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
    </div>
  );
}
