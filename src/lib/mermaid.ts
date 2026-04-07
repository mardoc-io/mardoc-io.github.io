"use client";

let mermaidReady: Promise<typeof import("mermaid")["default"]> | null = null;

function getMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
      });
      return m.default;
    });
  }
  return mermaidReady;
}

const MERMAID_KEYWORDS = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitgraph|journey|mindmap|timeline|quadrantChart|sankey|block|xychart|C4Context)\b/;

/**
 * Pre-render mermaid code blocks in an HTML string, replacing them with
 * <img> tags containing SVG data URIs. Use this before passing HTML to
 * TipTap, which manages its own DOM and can't have elements replaced post-render.
 */
export async function preRenderMermaid(html: string): Promise<string> {
  // Quick check — skip the mermaid import if no mermaid blocks
  if (!html.includes("language-mermaid") && !html.includes("class=\"mermaid")) return html;

  const temp = document.createElement("div");
  temp.innerHTML = html;

  const codeBlocks = temp.querySelectorAll<HTMLElement>(
    'code.mermaid, code[class*="language-mermaid"]'
  );
  if (codeBlocks.length === 0) return html;

  const mermaid = await getMermaid();

  for (let i = 0; i < codeBlocks.length; i++) {
    const codeEl = codeBlocks[i];
    const pre = codeEl.parentElement;
    if (!pre || pre.tagName !== "PRE") continue;

    const rawHtml = codeEl.innerHTML.replace(/<br\s*\/?>/gi, "\n");
    const textarea = document.createElement("textarea");
    textarea.innerHTML = rawHtml;
    const source = textarea.value.trim();

    try {
      const id = `mermaid-pre-${Date.now()}-${i}`;
      const { svg } = await mermaid.render(id, source);
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const blobUrl = URL.createObjectURL(blob);
      const img = document.createElement("img");
      img.src = blobUrl;
      img.alt = "Mermaid diagram";
      img.setAttribute("data-mermaid-source", source);
      pre.replaceWith(img);
    } catch (err) {
      console.warn("Mermaid render failed:", err);
    }
  }

  return temp.innerHTML;
}

/**
 * Find all mermaid code blocks in a container and render them as SVG diagrams.
 * Detects mermaid blocks by CSS class (dangerouslySetInnerHTML) or by content
 * keywords (TipTap which strips language classes).
 */
export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const allCodeBlocks = container.querySelectorAll<HTMLElement>("pre > code");
  const codeBlocks = Array.from(allCodeBlocks).filter((el) => {
    // Match by class (DiffViewer / dangerouslySetInnerHTML)
    if (el.classList.contains("mermaid") || el.className.includes("language-mermaid")) return true;
    // Match by content keywords (TipTap strips classes)
    const text = el.textContent?.trim() || "";
    return MERMAID_KEYWORDS.test(text);
  });
  if (codeBlocks.length === 0) return;

  const mermaid = await getMermaid();

  for (let i = 0; i < codeBlocks.length; i++) {
    const codeEl = codeBlocks[i];
    const pre = codeEl.parentElement;
    if (!pre || pre.tagName !== "PRE" || pre.dataset.mermaidRendered) continue;

    // Decode HTML entities and normalize line breaks (TipTap may use <br>)
    const rawHtml = codeEl.innerHTML.replace(/<br\s*\/?>/gi, "\n");
    const textarea = document.createElement("textarea");
    textarea.innerHTML = rawHtml;
    const source = textarea.value.trim();

    try {
      const id = `mermaid-${Date.now()}-${i}`;
      const { svg } = await mermaid.render(id, source);
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-diagram";
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch {
      // Leave the code block as-is if mermaid can't parse it
    }
  }
}
