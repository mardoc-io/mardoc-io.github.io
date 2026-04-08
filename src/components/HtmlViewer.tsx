"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { Code2, Eye, Maximize2, Minimize2 } from "lucide-react";

interface HtmlViewerProps {
  content: string;
  filePath: string;
  repoFullName?: string;
  branch?: string;
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

  const fileName = filePath.split("/").pop() || filePath;

  const processedContent = useMemo(() => {
    if (!content) return "";
    if (repoFullName && branch) {
      return rewriteHtmlAssetUrls(content, repoFullName, branch, filePath);
    }
    return content;
  }, [content, repoFullName, branch, filePath]);

  // Auto-resize iframe to fit content
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || viewSource) return;

    const handleLoad = () => {
      try {
        // With sandbox="allow-scripts" (no allow-same-origin),
        // we can't access iframe.contentDocument directly.
        // Instead, inject a resize script into the srcdoc that posts height.
      } catch {
        // Expected — cross-origin iframe
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [viewSource, processedContent]);

  // Inject a postMessage-based resize script into the srcdoc
  const srcdoc = useMemo(() => {
    if (!processedContent) return "";
    const resizeScript = `
<script>
(function() {
  function postHeight() {
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'mardoc-iframe-resize', height: h }, '*');
  }
  window.addEventListener('load', function() { setTimeout(postHeight, 100); });
  new MutationObserver(postHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
  // Also post after mermaid renders (can take a moment)
  setTimeout(postHeight, 500);
  setTimeout(postHeight, 2000);
})();
</script>`;

    // Insert resize script before </body> or at end
    if (processedContent.includes("</body>")) {
      return processedContent.replace("</body>", `${resizeScript}</body>`);
    }
    return processedContent + resizeScript;
  }, [processedContent]);

  // Listen for resize messages from the iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || viewSource) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "mardoc-iframe-resize" && typeof event.data.height === "number") {
        iframe.style.height = `${event.data.height + 20}px`;
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

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[var(--surface)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary,var(--surface))]">
        <span className="text-sm font-medium text-[var(--text)] truncate">{fileName}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewSource(!viewSource)}
            className={`toolbar-btn ${viewSource ? "bg-[var(--accent)]/10 text-[var(--accent)]" : ""}`}
            title={viewSource ? "Rendered view" : "View source"}
          >
            {viewSource ? <Eye size={16} /> : <Code2 size={16} />}
          </button>
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="toolbar-btn"
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Content */}
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
    </div>
  );
}
