/**
 * Mermaid round-trip tests.
 *
 * Verifies that mermaid diagram source is preserved through the
 * HTML → Turndown pipeline via the data-mermaid-source attribute.
 */
import { describe, it, expect } from "vitest";
import { createTurndownService } from "@/lib/turndown";

describe("mermaid round-trip via Turndown", () => {
  it("restores fenced mermaid block from img with data-mermaid-source", () => {
    const turndown = createTurndownService();
    const html = '<img src="blob:https://mardoc.app/abc123" alt="Mermaid diagram" data-mermaid-source="graph TD\nA --> B\nB --> C">';
    const md = turndown.turndown(html);
    expect(md).toContain("```mermaid");
    expect(md).toContain("graph TD");
    expect(md).toContain("A --> B");
    expect(md).toContain("B --> C");
    expect(md).toContain("```");
  });

  it("does not affect regular images without data-mermaid-source", () => {
    const turndown = createTurndownService();
    const html = '<img src="https://example.com/image.png" alt="photo">';
    const md = turndown.turndown(html);
    expect(md).toContain("![photo]");
    expect(md).toContain("https://example.com/image.png");
    expect(md).not.toContain("```mermaid");
  });

  it("preserves complex mermaid syntax (sequenceDiagram)", () => {
    const source = "sequenceDiagram\n    Alice->>Bob: Hello\n    Bob-->>Alice: Hi back";
    const turndown = createTurndownService();
    const html = `<img src="blob:x" alt="Mermaid diagram" data-mermaid-source="${source.replace(/"/g, "&quot;")}">`;
    const md = turndown.turndown(html);
    expect(md).toContain("```mermaid");
    expect(md).toContain("sequenceDiagram");
    expect(md).toContain("Alice->>Bob: Hello");
    expect(md).toContain("```");
  });

  it("preserves mermaid source with special characters", () => {
    const source = "graph TD\n    A[\"Start\"] --> B{Decision}\n    B -->|Yes| C[End]";
    const turndown = createTurndownService();
    const html = `<img src="blob:x" alt="Mermaid diagram" data-mermaid-source="${source.replace(/"/g, "&quot;")}">`;
    const md = turndown.turndown(html);
    expect(md).toContain("```mermaid");
    expect(md).toContain("graph TD");
    expect(md).toContain("Decision");
  });

  it("handles multiple mermaid diagrams in one document", () => {
    const turndown = createTurndownService();
    const html = `
      <p>First diagram:</p>
      <img src="blob:a" alt="Mermaid diagram" data-mermaid-source="graph LR\nA --> B">
      <p>Second diagram:</p>
      <img src="blob:b" alt="Mermaid diagram" data-mermaid-source="pie\n&quot;A&quot; : 40\n&quot;B&quot; : 60">
    `;
    const md = turndown.turndown(html);
    const fences = md.match(/```mermaid/g);
    expect(fences).toHaveLength(2);
    expect(md).toContain("graph LR");
    expect(md).toContain("pie");
  });
});
