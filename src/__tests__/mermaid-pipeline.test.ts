import { describe, it, expect } from "vitest";
import { blockToHtml } from "@/lib/diff-blocks";
import { highlightCodeBlocks } from "@/lib/highlight";

describe("mermaid block through diff pipeline", () => {
  it("produces a pre>code with mermaid/language-mermaid classes after blockToHtml + highlightCodeBlocks", () => {
    const mermaidBlock =
      "```mermaid\nflowchart LR\n    U[User] --> M[mardoc.app]\n    M --> G[GitHub API]\n```";
    const rendered = highlightCodeBlocks(blockToHtml(mermaidBlock));
    expect(rendered).toMatch(/<pre><code[^>]*class="[^"]*\blanguage-mermaid\b/);
    expect(rendered).toContain("flowchart LR");
    // No lowlight hljs classes should have been injected for mermaid
    expect(rendered).not.toContain("hljs-keyword");
  });
});
