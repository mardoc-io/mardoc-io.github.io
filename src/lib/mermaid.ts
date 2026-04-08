"use client";

const LIGHT_THEME_VARS = {
  primaryColor: "#E6F1FB",
  primaryTextColor: "#0C447C",
  primaryBorderColor: "#85B7EB",
  secondaryColor: "#E1F5EE",
  secondaryTextColor: "#085041",
  secondaryBorderColor: "#5DCAA5",
  tertiaryColor: "#FAEEDA",
  tertiaryTextColor: "#633806",
  tertiaryBorderColor: "#FAC775",
  lineColor: "#5F5E5A",
  textColor: "#2C2C2A",
  fontSize: "14px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  noteTextColor: "#2C2C2A",
  noteBkgColor: "#F1EFE8",
  noteBorderColor: "#B4B2A9",
};

const DARK_THEME_VARS = {
  primaryColor: "#363949",
  primaryTextColor: "#bd93f9",
  primaryBorderColor: "#6272a4",
  secondaryColor: "#1e3a2a",
  secondaryTextColor: "#50fa7b",
  secondaryBorderColor: "#50fa7b",
  tertiaryColor: "#3d1a1e",
  tertiaryTextColor: "#ffb86c",
  tertiaryBorderColor: "#ff79c6",
  lineColor: "#6272a4",
  textColor: "#f8f8f2",
  fontSize: "14px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  noteTextColor: "#f8f8f2",
  noteBkgColor: "#44475a",
  noteBorderColor: "#6272a4",
};

function detectDarkMode(): boolean {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
}

function getMermaidConfig(isDark: boolean) {
  return {
    startOnLoad: false,
    theme: "base" as const,
    securityLevel: "loose" as const,
    themeVariables: isDark ? DARK_THEME_VARS : LIGHT_THEME_VARS,
    flowchart: { curve: "basis" as const, padding: 16 },
    sequence: { actorMargin: 60, messageMargin: 40 },
  };
}

let mermaidReady: Promise<typeof import("mermaid")["default"]> | null = null;
let lastDark: boolean | null = null;

function getMermaid() {
  if (!mermaidReady) {
    const isDark = detectDarkMode();
    lastDark = isDark;
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize(getMermaidConfig(isDark));
      return m.default;
    });
  }
  return mermaidReady;
}

/** Re-initialize mermaid with the current theme. Call before rendering. */
async function syncMermaidTheme(): Promise<void> {
  const isDark = detectDarkMode();
  if (isDark === lastDark) return;
  lastDark = isDark;
  const mermaid = await getMermaid();
  mermaid.initialize(getMermaidConfig(isDark));
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

  await syncMermaidTheme();
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

  await syncMermaidTheme();
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
