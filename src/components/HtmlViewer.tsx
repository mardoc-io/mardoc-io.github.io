"use client";

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Braces, Maximize2, Minimize2, MessageSquare, X, GitPullRequest, Loader2 } from "lucide-react";
import { useIsMobile } from "@/lib/use-viewport";
import { useApp } from "@/lib/app-context";
import { injectSourceLineAttributes } from "@/lib/html-source-lines";
import { buildIframeSelectionScript } from "@/lib/html-selection";
import { createReviewPR, createInlineComment } from "@/lib/github-api";
import { analyzeHtml } from "@/lib/word-count";

interface HtmlViewerProps {
  content: string;
  filePath: string;
  repoFullName?: string;
  branch?: string;
}

interface HtmlComment {
  id: string;
  selectedText: string;
  startLine: number;
  endLine: number;
  body: string;
  author: string;
  createdAt: string;
  resolved: boolean;
}

/**
 * Rewrite relative asset URLs (images, links) in HTML content so they
 * resolve against the GitHub raw content CDN.
 */
function rewriteHtmlAssetUrls(
  html: string,
  repoFullName: string,
  ref: string,
  filePath: string
): string {
  const [owner, repo] = repoFullName.split("/");
  const fileDir = filePath.split("/").slice(0, -1).join("/");

  function resolveRelative(src: string): string | null {
    if (/^(https?:\/\/|data:|#|mailto:|javascript:)/i.test(src)) return null;

    let resolvedPath: string;
    if (src.startsWith("/")) {
      resolvedPath = src.slice(1);
    } else {
      const parts = [...fileDir.split("/").filter(Boolean), ...src.split("/")];
      const resolved: string[] = [];
      for (const p of parts) {
        if (p === ".." && resolved.length) resolved.pop();
        else if (p !== "." && p !== "") resolved.push(p);
      }
      resolvedPath = resolved.join("/");
    }

    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${resolvedPath}`;
  }

  // Rewrite src and href attributes on img, link, script, a, source, video, audio
  return html.replace(
    /(<(?:img|link|script|source|video|audio)\s[^>]*?(?:src|href)=")([^"]+)("[^>]*?>)/gi,
    (_match, before, url, after) => {
      const resolved = resolveRelative(url);
      return resolved ? `${before}${resolved}${after}` : _match;
    }
  );
}

export default function HtmlViewer({ content, filePath, repoFullName, branch }: HtmlViewerProps) {
  const [viewSource, setViewSource] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Commenting state — parity with the Editor's markdown comment flow.
  const [comments, setComments] = useState<HtmlComment[]>([]);
  const [pendingSelection, setPendingSelection] = useState<{
    text: string;
    startLine: number;
    endLine: number;
  } | null>(null);
  const [pendingCommentInput, setPendingCommentInput] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [submittingPR, setSubmittingPR] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedPR, setSubmittedPR] = useState<{ number: number; url: string } | null>(null);

  const isMobile = useIsMobile();
  const { isDemoMode } = useApp();

  const fileName = filePath.split("/").pop() || filePath;

  const processedContent = useMemo(() => {
    if (!content) return "";
    if (repoFullName && branch) {
      return rewriteHtmlAssetUrls(content, repoFullName, branch, filePath);
    }
    return content;
  }, [content, repoFullName, branch, filePath]);

  // Word count + reading time. Pure function, no DOM parser, cheap
  // to compute on each content change. Parity with the markdown
  // Editor's stats display.
  const stats = useMemo(() => analyzeHtml(content || ""), [content]);

  // Inject source-line attributes + resize + selection scripts into
  // the iframe srcdoc. Same pattern as DiffViewer's HTML handling.
  const srcdoc = useMemo(() => {
    if (!processedContent) return "";
    const tagged = injectSourceLineAttributes(processedContent);

    const resizeScript = `<script>(function(){function p(){window.parent.postMessage({type:'mardoc-iframe-resize',height:document.documentElement.scrollHeight},'*')}window.addEventListener('load',function(){setTimeout(p,100)});new MutationObserver(p).observe(document.body,{childList:true,subtree:true,attributes:true});setTimeout(p,500);setTimeout(p,2000)})()</script>`;
    const selectionScript = `<script>${buildIframeSelectionScript()}</script>`;
    const injected = resizeScript + selectionScript;

    if (tagged.includes("</body>")) {
      return tagged.replace("</body>", `${injected}</body>`);
    }
    return tagged + injected;
  }, [processedContent]);

  // Listen for iframe messages (resize + selection).
  useEffect(() => {
    if (viewSource) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      const iframe = iframeRef.current;

      if (data.type === "mardoc-iframe-resize" && typeof data.height === "number" && iframe) {
        iframe.style.height = `${data.height + 20}px`;
        return;
      }

      if (data.type === "mardoc-html-selection" && typeof data.text === "string") {
        if (iframe && event.source && event.source !== iframe.contentWindow) return;
        const startLine = typeof data.startLine === "number" ? data.startLine : 1;
        const endLine = typeof data.endLine === "number" ? data.endLine : startLine;
        setPendingSelection({ text: data.text, startLine, endLine });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [viewSource]);

  // Toggle fullscreen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (fullscreen && !document.fullscreenElement) {
      container.requestFullscreen?.();
    } else if (!fullscreen && document.fullscreenElement) {
      document.exitFullscreen?.();
    }

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [fullscreen]);

  const clearPending = useCallback(() => {
    setPendingSelection(null);
    setPendingCommentInput("");
  }, []);

  const submitSelectionComment = useCallback(() => {
    if (!pendingSelection || !pendingCommentInput.trim()) return;
    const newComment: HtmlComment = {
      id: `hc-${Date.now()}`,
      selectedText: pendingSelection.text,
      startLine: pendingSelection.startLine,
      endLine: pendingSelection.endLine,
      body: pendingCommentInput.trim(),
      author: "you",
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    setComments((prev) => [...prev, newComment]);
    setShowPanel(true);
    clearPending();
  }, [pendingSelection, pendingCommentInput, clearPending]);

  const discardComment = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleSubmitAsPR = useCallback(async () => {
    if (!repoFullName || isDemoMode || comments.length === 0) return;
    setSubmittingPR(true);
    setSubmitError(null);
    try {
      const description = comments
        .map((c) => `> _"${c.selectedText}"_\n\n${c.body}`)
        .join("\n\n---\n\n");

      const pr = await createReviewPR(
        repoFullName,
        `Review comments on ${filePath}`,
        description,
        filePath
      );

      // Post each comment as an inline review comment using the
      // line numbers we already captured from the iframe script.
      for (const comment of comments) {
        try {
          await createInlineComment(
            repoFullName,
            pr.number,
            comment.body,
            filePath,
            comment.endLine,
            comment.startLine !== comment.endLine ? comment.startLine : undefined
          );
        } catch {
          // If inline fails, the comment is still in the PR description
        }
      }

      setSubmittedPR({ number: pr.number, url: `https://github.com/${repoFullName}/pull/${pr.number}` });
      setComments([]);
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to create review PR");
    } finally {
      setSubmittingPR(false);
    }
  }, [repoFullName, isDemoMode, comments, filePath]);

  const unresolvedCount = comments.filter((c) => !c.resolved).length;

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[var(--surface)]">
      {/* Toolbar. Button order matches the markdown Editor's toolbar
          so the two surfaces feel like the same app. Right-side order:
          word count → Code/Rich toggle → Fullscreen toggle → Comments
          toggle. The Code/Rich toggle uses the same Braces icon + text
          label pattern as the Editor. */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary,var(--surface))]">
        <span className="text-sm font-medium text-[var(--text)] truncate">{fileName}</span>
        <div className="flex items-center gap-1">
          {/* Word count + reading time — hidden when empty */}
          {stats.words > 0 && (
            <span
              className="hidden sm:inline text-[10px] text-[var(--text-muted)] font-mono px-1.5 select-none"
              title={`${stats.words.toLocaleString()} words · ~${stats.readingMinutes} min read`}
            >
              {stats.words.toLocaleString()} words · {stats.readingMinutes} min
            </span>
          )}

          {/* Code / Rich toggle — same pattern as Editor */}
          <button
            onClick={() => setViewSource(!viewSource)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
              viewSource
                ? "bg-[var(--accent-muted)] text-[var(--accent)] font-medium"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            }`}
            title={viewSource ? "Switch back to rendered view" : "View raw HTML"}
          >
            <Braces size={13} />
            {viewSource ? "Rich" : "Code"}
          </button>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="toolbar-btn"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          {/* Comments toggle — same pattern as Editor: badge + count */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${
              showPanel
                ? "bg-[var(--accent-muted)] text-[var(--accent)] font-medium"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
            }`}
            title="Toggle comments panel"
          >
            <MessageSquare size={13} />
            {unresolvedCount > 0 && (
              <span className="bg-[var(--accent)] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unresolvedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Pending selection comment input — same pattern as DiffViewer.
          Desktop: inline below the toolbar.
          Mobile: fixed-bottom with backdrop so it's visible no matter
          where the user has scrolled inside the iframe. */}
      {pendingSelection && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40"
            onClick={clearPending}
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
                &ldquo;{pendingSelection.text}&rdquo;
              </div>
              <div className="text-[9px] text-[var(--text-muted)] mb-2">
                {pendingSelection.startLine === pendingSelection.endLine
                  ? `Line ${pendingSelection.startLine}`
                  : `Lines ${pendingSelection.startLine}–${pendingSelection.endLine}`}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={pendingCommentInput}
                  onChange={(e) => setPendingCommentInput(e.target.value)}
                  placeholder="Write your comment..."
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && pendingCommentInput.trim()) {
                      submitSelectionComment();
                    }
                    if (e.key === "Escape") clearPending();
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
                  onClick={clearPending}
                  className="text-xs px-2 py-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Content + comments panel */}
      <div className="flex-1 overflow-hidden flex">
        <div className="flex-1 overflow-auto">
          {viewSource ? (
            <pre className="p-4 text-sm font-mono text-[var(--text)] whitespace-pre-wrap break-words overflow-auto">
              <code>{content}</code>
            </pre>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={srcdoc}
              sandbox="allow-scripts allow-same-origin"
              title={fileName}
              className="w-full border-0"
              style={{ minHeight: "100%", height: "100%" }}
            />
          )}
        </div>

        {/* Simple comment panel — desktop only. Mobile uses pending bar + list modal. */}
        {showPanel && !isMobile && (
          <aside className="w-72 shrink-0 border-l border-[var(--border)] bg-[var(--surface-secondary)] flex flex-col">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
              <span className="text-xs font-medium text-[var(--text-primary)]">
                Comments ({unresolvedCount})
              </span>
              <button onClick={() => setShowPanel(false)} className="toolbar-btn" style={{ width: 24, height: 24 }}>
                <X size={12} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {comments.length === 0 ? (
                <div className="text-center py-8 px-2">
                  <MessageSquare size={20} className="mx-auto mb-2 text-[var(--text-muted)]" />
                  <p className="text-xs text-[var(--text-muted)]">
                    Select text in the rendered document to leave a comment.
                  </p>
                </div>
              ) : (
                comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                  >
                    <div className="text-[10px] text-[var(--accent)] bg-[var(--accent-muted)] px-2 py-1 rounded-md font-mono leading-snug line-clamp-2 mb-2">
                      &ldquo;{c.selectedText}&rdquo;
                    </div>
                    <div className="text-[9px] text-[var(--text-muted)] mb-1">
                      {c.startLine === c.endLine ? `Line ${c.startLine}` : `Lines ${c.startLine}–${c.endLine}`}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-1.5">
                      {c.body}
                    </p>
                    <button
                      onClick={() => discardComment(c.id)}
                      className="text-[9px] text-[var(--text-muted)] hover:text-red-600 transition-colors"
                    >
                      Discard
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Submit-as-PR footer */}
            {comments.length > 0 && !isDemoMode && repoFullName && (
              <div className="border-t border-[var(--border)] p-2 space-y-2">
                {submittedPR ? (
                  <a
                    href={submittedPR.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-[var(--accent)] hover:underline text-center"
                  >
                    ✓ Review PR #{submittedPR.number} created
                  </a>
                ) : (
                  <>
                    <button
                      onClick={handleSubmitAsPR}
                      disabled={submittingPR}
                      className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-[var(--accent)] text-white rounded-md hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                    >
                      {submittingPR ? <Loader2 size={12} className="animate-spin" /> : <GitPullRequest size={12} />}
                      {submittingPR ? "Creating PR..." : "Create Review PR"}
                    </button>
                    {submitError && <p className="text-[10px] text-red-500">{submitError}</p>}
                  </>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
