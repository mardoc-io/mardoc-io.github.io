"use client";

import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  parseBlocks,
  computeBlockLineRanges,
  blockToHtml as blockToHtmlRaw,
  computeWordDiff,
  computeSplitWordDiff,
} from "@/lib/diff-blocks";
import { PRFile, PRComment, PendingSuggestion } from "@/types";
import {
  MessageSquare,
  MessageSquarePlus,
  Plus,
  Check,
  X,
  Maximize2,
  Minimize2,
  Pencil,
  Eye,
  Code,
  FileCode,
  Hash,
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
import CommentPanel, { type PanelComment } from "./CommentPanel";
import SuggestBlockEditor from "./SuggestBlockEditor";
import { extractCommentSuggestions, mergeSuggestions } from "@/lib/suggestion-extract";
import { parseSuggestionBody } from "@/lib/suggestion-body";
import { injectCommentHighlights } from "@/lib/highlight-comments";

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
  splitDiffBase?: string;
  splitDiffHead?: string;
  baseLine?: number;
  headLine?: number;
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

// Decide whether two markdown blocks are plausibly an edit of each
// other (as opposed to unrelated blocks the pair-matcher walked past
// because neither's exact twin exists within 5 blocks).
//
// Without this gate, two prose blocks are treated as "compatible" by
// a naive fence-only check, and greedy 1-to-1 word-diffing fuses
// unrelated content: e.g. base `## Value\n<para>` paired with head
// `## The reframe\n<para>` renders a single Modified block whose
// heading reads "ValueThe reframe" and whose body interleaves base
function LineGutter({ line }: { line?: number }) {
  if (line == null) return null;
  return (
    <span className="line-gutter select-none text-[10px] font-mono text-[var(--text-muted)] opacity-60 mr-2 inline-block w-8 text-right shrink-0">
      {line}
    </span>
  );
}

// and head sentences. The fix is to refuse word-diff when the
// structural shape disagrees or the word-level overlap is too low,
// and let the caller's widening/orphan path emit them as separate
// Removed + Added blocks.
function blocksArePlausibleEdit(a: string, b: string): boolean {
  // Extract the leading structural token. Headings are compared at
  // the level AND text-word-overlap layer because a heading rewrite
  // is a common and legitimate edit, while two different headings
  // at the same level are almost always unrelated sections.
  const headingA = a.match(/^(#+)\s+(.*)$/m);
  const headingB = b.match(/^(#+)\s+(.*)$/m);
  if (headingA && headingB) {
    if (headingA[1] !== headingB[1]) return false;
    const wordsA = new Set(headingA[2].toLowerCase().match(/\w+/g) ?? []);
    const wordsB = new Set(headingB[2].toLowerCase().match(/\w+/g) ?? []);
    if (wordsA.size === 0 && wordsB.size === 0) return true;
    const arrA = Array.from(wordsA);
    const arrB = Array.from(wordsB);
    const overlap = arrA.filter((w) => wordsB.has(w)).length;
    const union = new Set(arrA.concat(arrB)).size;
    return union === 0 ? true : overlap / union >= 0.3;
  }
  // If exactly one is a heading, they're structurally different.
  if (!!headingA !== !!headingB) return false;
  // Prose/list/quote blocks: accept any block pair that shares
  // enough unique words that a word-diff would be readable rather
  // than a character-by-character salad. Jaccard threshold chosen
  // so a typo fix (~95%) and a paragraph rewrite (~35%) pass but
  // two unrelated paragraphs (~10%) don't.
  const tokenize = (s: string): Set<string> =>
    new Set(s.toLowerCase().match(/\w+/g) ?? []);
  const wordsA = tokenize(a);
  const wordsB = tokenize(b);
  if (wordsA.size === 0 || wordsB.size === 0) return wordsA.size === wordsB.size;
  const arrA = Array.from(wordsA);
  const arrB = Array.from(wordsB);
  const overlap = arrA.filter((w) => wordsB.has(w)).length;
  const union = new Set(arrA.concat(arrB)).size;
  return overlap / union >= 0.3;
}

// ─── Memoized dangerouslySetInnerHTML wrapper ─────────────────────────────
//
// React 18 re-applies innerHTML on every re-render when the
// dangerouslySetInnerHTML prop is an inline object literal — the
// reconciler in updateProperties compares props by reference
// (`_nextProp !== _lastProp`), and `{__html: "..."}` literals never
// pass that check. setProp → setInnerHTML$1 then runs unconditionally.
//
// For post-render DOM mutations (mermaid SVG, syntax highlighting
// overlays, fetched-image data: URIs) that's destructive: the
// mutation is wiped on any unrelated re-render (e.g. a sibling state
// change). Wrapping the block in React.memo with just the html
// string as a prop hits `updateHostComponent`'s
// `oldProps === newProps` bailout, so the div is never re-committed
// and the mutation survives.
const MarkdownBlock = React.memo(function MarkdownBlock({
  html,
  className,
  onClick,
}: {
  html: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onClick}
    />
  );
});

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
  const [showLineNumbers, setShowLineNumbers] = useState(false);
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
  // Re-runs when comments change because renderBlockHtml injects highlight marks for
  // commented ranges; when those marks shift, MarkdownBlock's memo bailout misses and
  // the DOM is re-committed, so we need to re-render mermaid for the affected blocks.
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
  //
  // The iframe reference is read fresh on every message — capturing
  // it in the closure at effect-time caused a stale-ref bug where
  // legitimate selection messages were rejected after the iframe
  // was remounted (e.g. when switching between Rendered and Source
  // views, or when the srcdoc changes).
  useEffect(() => {
    if (!fileIsHtml) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      const iframe = htmlIframeRef.current;

      if (data.type === "mardoc-iframe-resize" && typeof data.height === "number" && iframe) {
        iframe.style.height = `${data.height + 20}px`;
        return;
      }

      if (data.type === "mardoc-html-selection" && typeof data.text === "string") {
        // If we have a live iframe ref, only accept messages from it.
        // If we don't (stale ref, timing issue), accept on the basis of
        // the message type alone — the structural check above already
        // rules out random cross-frame messages.
        if (iframe && event.source && event.source !== iframe.contentWindow) return;
        const startLine = typeof data.startLine === "number" ? data.startLine : 1;
        const endLine = typeof data.endLine === "number" ? data.endLine : startLine;
        setPendingSelection(data.text);
        setPendingSelectionRange({ startLine, endLine });
        // Do NOT auto-open the panel here — on mobile that would
        // render the CommentPanel in a BottomSheet that covers the
        // pending-comment bar (both are fixed-bottom). The panel
        // will auto-open after the comment is submitted via the
        // existing allPanelComments effect.
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

  // Map PR comments into panel format, filtered to the current file.
  // Review comments (rc-*) match on path; pending comments match on
  // pendingPath; issue comments (ic-*, no path) are PR-level and
  // excluded from per-file views.
  const allPanelComments: PanelComment[] = useMemo(() => {
    const filePath = file.path;
    return comments
      .filter((c) => {
        if (c.pending) return c.pendingPath === filePath;
        if (c.path) return c.path === filePath;
        return false;
      })
      .map((c) => {
        // For GitHub comments with line ranges but no selectedText,
        // extract the text from the file content and strip markdown
        // syntax so it matches against the rendered HTML text layer.
        let selectedText = c.selectedText || "";
        if (!selectedText && c.startLine && c.endLine && file.headContent) {
          const lines = file.headContent.split("\n");
          const raw = lines
            .slice(c.startLine - 1, c.endLine)
            .join("\n")
            .trim();
          selectedText = raw
            .replace(/^#{1,6}\s+/gm, "")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/`(.+?)`/g, "$1")
            .replace(/^>\s?/gm, "")
            .replace(/^[-*+]\s+/gm, "")
            .replace(/^\d+\.\s+/gm, "")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .trim();
        }

        return {
          id: c.id,
          selectedText,
          body: c.body,
          author: c.author,
          avatarColor: c.avatarColor,
          createdAt: c.createdAt,
          blockIndex: c.blockIndex || 0,
          startLine: c.startLine,
          endLine: c.endLine,
          resolved: c.resolved,
          replies: (c.replies || []).map((r) => ({
            author: r.author,
            avatarColor: r.avatarColor,
            body: r.body,
            createdAt: r.createdAt,
          })),
          source: c.pending ? ("local" as const) : ("github" as const),
          pending: c.pending,
        };
      });
  }, [comments, file.path, file.headContent]);

  // Auto-show the panel on the 0→N transition — initial mount when a
  // PR already has unresolved comments, or later when a new comment
  // lands in a previously-empty thread. Guarded against same-count
  // updates: `mergeFreshComments` returns a fresh array every 30s
  // poll tick, and without this ref the user couldn't close the
  // panel — the next tick's comments-reference change would reopen
  // it even when the unresolved set was identical.
  const prevHadUnresolvedRef = useRef(false);
  useEffect(() => {
    const hasUnresolved = allPanelComments.some((c) => !c.resolved);
    if (hasUnresolved && !prevHadUnresolvedRef.current) {
      setShowPanel(true);
    }
    prevHadUnresolvedRef.current = hasUnresolved;
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

  // Parsed blocks with line ranges
  const headBlocks = useMemo(() => parseBlocks(file.headContent), [file.headContent]);
  const headBlockRanges = useMemo(
    () => computeBlockLineRanges(file.headContent, headBlocks),
    [file.headContent, headBlocks]
  );
  const baseBlocks = useMemo(() => parseBlocks(file.baseContent), [file.baseContent]);
  const baseBlockRanges = useMemo(
    () => computeBlockLineRanges(file.baseContent, baseBlocks),
    [file.baseContent, baseBlocks]
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
    const bBlocks = parseBlocks(file.baseContent);
    const hBlocks = parseBlocks(file.headContent);
    const bRanges = computeBlockLineRanges(file.baseContent, bBlocks);
    const hRanges = computeBlockLineRanges(file.headContent, hBlocks);
    const result: DiffBlock[] = [];
    let bi = 0;
    let hi = 0;

    while (bi < bBlocks.length || hi < hBlocks.length) {
      if (bi >= bBlocks.length) {
        result.push({ type: "added", baseText: "", headText: hBlocks[hi], headLine: hRanges[hi]?.startLine });
        hi++;
      } else if (hi >= hBlocks.length) {
        result.push({ type: "removed", baseText: bBlocks[bi], headText: "", baseLine: bRanges[bi]?.startLine });
        bi++;
      } else if (bBlocks[bi] === hBlocks[hi]) {
        result.push({ type: "unchanged", baseText: bBlocks[bi], headText: hBlocks[hi], baseLine: bRanges[bi]?.startLine, headLine: hRanges[hi]?.startLine });
        bi++;
        hi++;
      } else {
        const headLookAhead = hBlocks.slice(hi, hi + 5).indexOf(bBlocks[bi]);
        const baseLookAhead = bBlocks.slice(bi, bi + 5).indexOf(hBlocks[hi]);

        if (headLookAhead > 0 && (baseLookAhead === -1 || headLookAhead <= baseLookAhead)) {
          for (let i = 0; i < headLookAhead; i++) {
            result.push({ type: "added", baseText: "", headText: hBlocks[hi + i], headLine: hRanges[hi + i]?.startLine });
          }
          hi += headLookAhead;
        } else if (baseLookAhead > 0) {
          for (let i = 0; i < baseLookAhead; i++) {
            result.push({ type: "removed", baseText: bBlocks[bi + i], headText: "", baseLine: bRanges[bi + i]?.startLine });
          }
          bi += baseLookAhead;
        } else {
          const baseFence = bBlocks[bi].match(/^```(\S*)/)?.[1];
          const headFence = hBlocks[hi].match(/^```(\S*)/)?.[1];
          const fenceCompatible =
            (baseFence === undefined && headFence === undefined) ||
            (baseFence !== undefined && baseFence === headFence);
          const compatible =
            fenceCompatible &&
            blocksArePlausibleEdit(bBlocks[bi], hBlocks[hi]);
          if (!compatible) {
            const wideHead = hBlocks.slice(hi).indexOf(bBlocks[bi]);
            const wideBase = bBlocks.slice(bi).indexOf(hBlocks[hi]);
            if (wideHead > 0 && (wideBase === -1 || wideHead <= wideBase)) {
              for (let i = 0; i < wideHead; i++) {
                result.push({ type: "added", baseText: "", headText: hBlocks[hi + i], headLine: hRanges[hi + i]?.startLine });
              }
              hi += wideHead;
            } else if (wideBase > 0) {
              for (let i = 0; i < wideBase; i++) {
                result.push({ type: "removed", baseText: bBlocks[bi + i], headText: "", baseLine: bRanges[bi + i]?.startLine });
              }
              bi += wideBase;
            } else {
              result.push({ type: "removed", baseText: bBlocks[bi], headText: "", baseLine: bRanges[bi]?.startLine });
              result.push({ type: "added", baseText: "", headText: hBlocks[hi], headLine: hRanges[hi]?.startLine });
              bi++;
              hi++;
            }
          } else {
            const split = computeSplitWordDiff(bBlocks[bi], hBlocks[hi]);
            result.push({
              type: "modified",
              baseText: bBlocks[bi],
              headText: hBlocks[hi],
              diffHtml: computeWordDiff(bBlocks[bi], hBlocks[hi]),
              splitDiffBase: split.base,
              splitDiffHead: split.head,
              baseLine: bRanges[bi]?.startLine,
              headLine: hRanges[hi]?.startLine,
            });
            bi++;
            hi++;
          }
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

  // Render block content with highlighted commented text.
  // Uses DOMParser to match against text content (not raw HTML),
  // so highlights work across tag boundaries and never match
  // inside attributes.
  const renderBlockHtml = useCallback(
    (rawHtml: string) => {
      const activeComments = allPanelComments
        .filter((c) => !c.resolved && c.selectedText)
        .map((c) => ({ selectedText: c.selectedText, commentId: c.id }));
      return injectCommentHighlights(rawHtml, activeComments);
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

          {!fileIsHtml && (
            <button
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className={`toolbar-btn ${showLineNumbers ? "active" : ""}`}
              title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
            >
              <Hash size={14} />
            </button>
          )}

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

      {/* Pending selection comment input.
          Desktop: inline below the toolbar.
          Mobile: fixed to the bottom of the viewport with a backdrop
          so it stays visible no matter where the user has scrolled
          inside the iframe. The mobile placement matches the
          MobileCommentButton pattern so users have one consistent
          place to look for commenting affordances. */}
      {pendingSelection && (
        <>
          {/* Mobile backdrop — dims the content and blocks taps outside the bar */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={() => {
              setPendingSelection(null);
              setPendingSelectionRange(null);
              setPendingCommentInput("");
            }}
            aria-hidden="true"
          />
          <div
            className="
              bg-[var(--accent-muted)] border-b border-[var(--accent)] px-4 py-2.5
              flex items-start gap-3
              md:static
              fixed left-0 right-0 bottom-0 z-50 md:z-auto
              md:border-b border-t border-[var(--accent)] md:border-t-0
              shadow-[0_-8px_24px_-4px_rgba(0,0,0,0.4)] md:shadow-none
            "
          >
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
                autoFocus
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
        </>
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
                  <div key={idx} className={`group relative mb-1 ${showLineNumbers ? "flex items-start" : ""}`}>
                    {showLineNumbers && (
                      <div className="pt-1 shrink-0">
                        {(block.type === "removed") ? (
                          <LineGutter line={block.baseLine} />
                        ) : (
                          <LineGutter line={block.headLine} />
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                    {block.type === "unchanged" && (
                      <MarkdownBlock
                        className="rendered-block diff-content"
                        html={renderBlockHtml(headBlockToHtml(block.headText))}
                        onClick={handleMarkClick}
                      />
                    )}

                    {block.type === "added" && (
                      <div className="diff-block-added diff-content">
                        <div className="flex items-center gap-1 text-xs text-[var(--diff-add-text)] font-medium mb-1">
                          <Plus size={12} /> Added
                        </div>
                        <MarkdownBlock
                          html={renderBlockHtml(headBlockToHtml(block.headText))}
                          onClick={handleMarkClick}
                        />
                      </div>
                    )}

                    {block.type === "removed" && (
                      <div className="diff-block-removed diff-content">
                        <div className="flex items-center gap-1 text-xs text-[var(--diff-remove-text)] font-medium mb-1">
                          <X size={12} /> Removed
                        </div>
                        <MarkdownBlock
                          html={renderBlockHtml(baseBlockToHtml(block.baseText))}
                        />
                      </div>
                    )}

                    {block.type === "modified" && (
                      <div className="border-l-3 border-[var(--accent)] pl-4 my-2 bg-[var(--accent-muted)] rounded-r-md py-2 pr-3 diff-content">
                        <div className="flex items-center gap-1 text-xs text-[var(--accent)] font-medium mb-1">
                          Modified
                        </div>
                        <MarkdownBlock
                          className="text-sm leading-relaxed"
                          html={renderBlockHtml(
                            headBlockToHtml(block.diffHtml || block.headText)
                          )}
                          onClick={handleMarkClick}
                        />
                      </div>
                    )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : viewMode === "split" ? (
            /* Split view — single scroll, aligned rows, diff-colored */
            <div className="relative h-full overflow-y-auto" ref={contentRef}>
              <FloatingToolbar
                containerRef={contentRef}
                onComment={handleSelectionComment}
              />
              <ContextMenu
                containerRef={contentRef}
                onComment={handleSelectionComment}
                onSuggestChange={handleSuggestFromContext}
              />
              {/* Sticky header row */}
              <div className="grid grid-cols-2 sticky top-0 z-10">
                <div className="px-4 py-2 text-xs text-[var(--text-muted)] bg-[var(--diff-remove)] border-b border-r border-[var(--border)] font-medium">
                  base: {file.path}
                </div>
                <div className="px-4 py-2 text-xs text-[var(--text-muted)] bg-[var(--diff-add)] border-b border-[var(--border)] font-medium">
                  head: {file.path}
                </div>
              </div>
              {/* Aligned diff rows */}
              <div className="grid grid-cols-2">
                {diffBlocks.map((block, idx) => (
                  <React.Fragment key={idx}>
                    {block.type === "unchanged" && (
                      <>
                        <div className="p-4 border-r border-[var(--border)] diff-content flex items-start">
                          {showLineNumbers && <LineGutter line={block.baseLine} />}
                          <div className="flex-1 min-w-0">
                            <MarkdownBlock
                              html={renderBlockHtml(baseBlockToHtml(block.baseText))}
                              onClick={handleMarkClick}
                            />
                          </div>
                        </div>
                        <div className="p-4 diff-content flex items-start">
                          {showLineNumbers && <LineGutter line={block.headLine} />}
                          <div className="flex-1 min-w-0">
                            <MarkdownBlock
                              html={renderBlockHtml(headBlockToHtml(block.headText))}
                              onClick={handleMarkClick}
                            />
                          </div>
                        </div>
                      </>
                    )}
                    {block.type === "removed" && (
                      <>
                        <div className="p-4 border-r border-[var(--border)] bg-[var(--diff-remove)] diff-content flex items-start">
                          {showLineNumbers && <LineGutter line={block.baseLine} />}
                          <div className="flex-1 min-w-0">
                            <MarkdownBlock
                              html={renderBlockHtml(baseBlockToHtml(block.baseText))}
                            />
                          </div>
                        </div>
                        <div className="p-4 border-r-0" />
                      </>
                    )}
                    {block.type === "added" && (
                      <>
                        <div className="p-4 border-r border-[var(--border)]" />
                        <div className="p-4 bg-[var(--diff-add)] diff-content flex items-start">
                          {showLineNumbers && <LineGutter line={block.headLine} />}
                          <div className="flex-1 min-w-0">
                            <MarkdownBlock
                              html={renderBlockHtml(headBlockToHtml(block.headText))}
                              onClick={handleMarkClick}
                            />
                          </div>
                        </div>
                      </>
                    )}
                    {block.type === "modified" && (
                      <>
                        <div className="p-4 border-r border-[var(--border)] bg-[var(--diff-remove)] diff-content flex items-start">
                          {showLineNumbers && <LineGutter line={block.baseLine} />}
                          <div className="flex-1 min-w-0">
                            <MarkdownBlock
                              html={renderBlockHtml(baseBlockToHtml(block.splitDiffBase || block.baseText))}
                            />
                          </div>
                        </div>
                        <div className="p-4 bg-[var(--diff-add)] diff-content flex items-start">
                          {showLineNumbers && <LineGutter line={block.headLine} />}
                          <div className="flex-1 min-w-0">
                            <MarkdownBlock
                              html={renderBlockHtml(headBlockToHtml(block.splitDiffHead || block.headText))}
                              onClick={handleMarkClick}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </React.Fragment>
                ))}
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
                      <SuggestBlockEditor
                        key={idx}
                        blockIndex={idx}
                        startLine={headBlockRanges[idx].startLine}
                        endLine={headBlockRanges[idx].endLine}
                        text={editingText}
                        onTextChange={setEditingText}
                        onFinish={finishEditingBlock}
                        onDelete={deleteEditingBlock}
                        onCancel={() => { setEditingBlockIndex(null); setEditingText(""); }}
                        textareaRef={editTextareaRef}
                      />
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
                      <MarkdownBlock
                        className="rendered-block diff-content"
                        html={
                          hasSuggestion
                            ? headBlockToHtml(suggestionForBlock!.editedMarkdown)
                            : headBlockToHtml(block)
                        }
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
                      <div key={idx} className={`${showLineNumbers ? "flex items-start" : ""} mb-1`}>
                        {showLineNumbers && (
                          <div className="pt-1 shrink-0">
                            <LineGutter line={headBlockRanges[idx]?.startLine} />
                          </div>
                        )}
                        <MarkdownBlock
                          className={`rendered-block flex-1 min-w-0 ${hasSuggestion ? "border-l-2 border-[var(--accent)] pl-3 bg-[var(--accent-muted)] rounded-r" : ""}`}
                          html={renderBlockHtml(headBlockToHtml(block))}
                          onClick={handleMarkClick}
                        />
                      </div>
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
