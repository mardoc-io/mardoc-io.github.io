/**
 * E2E tests for MarDoc's rendering features.
 *
 * Transforms for each feature (mermaid, GitHub alerts, footnotes, tables,
 * syntax highlighting) are unit-tested in src/__tests__/. These e2e tests
 * prove the transforms that reach the editor DOM are actually wired up —
 * a broken extension pipeline or a missing Showdown plugin fails here.
 *
 * Covers:
 *   - Mermaid code fences render as pre-rendered diagram images
 *   - Tables render as <table> elements with column headers
 *   - Inline code renders as <code>
 *   - Code blocks render with lowlight syntax highlighting spans
 *
 * NOT covered here (intentional):
 *   - GitHub alerts ([!NOTE] etc.) — rendered via dangerouslySetInnerHTML
 *     in PRDetail.tsx, not via TipTap. TipTap strips the wrapper div
 *     because markdown-alert isn't a registered node type. Transform
 *     correctness lives in src/__tests__/github-alerts.test.ts (22 cases).
 *   - Footnotes — same story: the <sup class="footnote-ref"> wrapper is
 *     stripped by TipTap. Transform correctness in
 *     src/__tests__/footnotes.test.ts.
 */
import { test, expect } from "@playwright/test";
import { openMarkdownFile } from "./fixtures/helpers";

test.describe("Rendering: mermaid diagrams", () => {
  test("A mermaid code fence renders as a diagram image", async ({ page }) => {
    await openMarkdownFile(page, /README\.md/);
    // MarDoc pre-renders mermaid fences to an SVG data URL that is
    // embedded as an <img alt="Mermaid diagram">. The README ships
    // three such diagrams — at least one should be visible.
    await expect(
      page.locator('.ProseMirror img[alt="Mermaid diagram"]').first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("Rendering: tables", () => {
  test("A markdown table renders as an HTML <table>", async ({ page }) => {
    await openMarkdownFile(page, /README\.md/);
    // Demo README has several tables — at minimum one with the "Syntax"
    // column header. Table should be rendered, not raw markdown.
    await expect(page.locator(".ProseMirror table").first()).toBeVisible({
      timeout: 3_000,
    });
    // Spot-check a known column header is rendered as a th
    await expect(
      page.locator(".ProseMirror th", { hasText: "Syntax" })
    ).toBeVisible();
  });
});

test.describe("Rendering: code blocks and inline code", () => {
  test("Fenced code blocks render with syntax highlighting", async ({ page }) => {
    await openMarkdownFile(page, /README\.md/);
    // lowlight wraps highlighted tokens in <span class="hljs-...">.
    // We just assert at least one such span exists inside a .ProseMirror pre.
    await expect(
      page.locator('.ProseMirror pre code [class^="hljs-"]').first()
    ).toBeVisible({ timeout: 3_000 });
  });

  test("Inline code renders as a <code> element", async ({ page }) => {
    await openMarkdownFile(page, /README\.md/);
    // The README has `**bold**` in an inline code span inside its
    // syntax table.
    await expect(page.locator(".ProseMirror code").first()).toBeVisible({
      timeout: 3_000,
    });
  });
});

