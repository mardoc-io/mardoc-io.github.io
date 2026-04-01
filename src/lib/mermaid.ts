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

/**
 * Find all mermaid code blocks in a container and render them as SVG diagrams.
 * Showdown outputs: <pre><code class="mermaid language-mermaid">...</code></pre>
 */
export async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const codeBlocks = container.querySelectorAll<HTMLElement>(
    'code.mermaid, code[class*="language-mermaid"]'
  );
  if (codeBlocks.length === 0) return;

  const mermaid = await getMermaid();

  for (let i = 0; i < codeBlocks.length; i++) {
    const codeEl = codeBlocks[i];
    const pre = codeEl.parentElement;
    if (!pre || pre.tagName !== "PRE" || pre.dataset.mermaidRendered) continue;

    // Decode HTML entities that Showdown escapes (e.g. &gt; -> >)
    const textarea = document.createElement("textarea");
    textarea.innerHTML = codeEl.innerHTML;
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
