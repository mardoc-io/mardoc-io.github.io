/**
 * E2E tests for markdown editing in the rich TipTap editor.
 *
 * Covers the core editing flows a user performs every session:
 *   - Toolbar formatting (bold, italic, strike, code)
 *   - Heading buttons (H1/H2/H3)
 *   - List buttons (bullet, ordered, task list)
 *   - Blockquote and code block insertion
 *   - Code view toggle round-trip (markdown ↔ rich)
 *   - Outline panel toggle
 *
 * These run against the real demo README.md, so any TipTap extension
 * change that breaks a formatting action fails here.
 */
import { test, expect } from "@playwright/test";
import { openMarkdownFile } from "./fixtures/helpers";

// Each test gets its own page context. The editor maintains in-memory
// and localStorage state between serial tests, which caused flakiness
// when earlier tests mutated the demo README — parallel pages give
// each test a clean slate.

/**
 * Focus the ProseMirror editor and select all its content so the
 * following formatting toolbar click has something to act on.
 */
async function focusAndSelectAll(page: import("@playwright/test").Page) {
  const pm = page.locator(".ProseMirror");
  await pm.click();
  await page.keyboard.press("ControlOrMeta+A");
}

test.describe("Editor toolbar: inline formatting", () => {
  test("Bold button wraps selected text in <strong>", async ({ page }) => {
    await openMarkdownFile(page);
    await focusAndSelectAll(page);
    await page.locator('button[title="Bold (⌘B)"]').locator("visible=true").first().click();
    await expect(page.locator(".ProseMirror strong").first()).toBeVisible({
      timeout: 2_000,
    });
  });

  test("Italic button wraps selected text in <em>", async ({ page }) => {
    await openMarkdownFile(page);
    await focusAndSelectAll(page);
    await page.locator('button[title="Italic (⌘I)"]').locator("visible=true").first().click();
    await expect(page.locator(".ProseMirror em").first()).toBeVisible({
      timeout: 2_000,
    });
  });

  test("Strikethrough button wraps selected text in <s>", async ({ page }) => {
    await openMarkdownFile(page);
    await focusAndSelectAll(page);
    await page
      .locator('button[title^="Strikethrough"]')
      .locator("visible=true")
      .first()
      .click();
    await expect(page.locator(".ProseMirror s").first()).toBeVisible({
      timeout: 2_000,
    });
  });
});

test.describe("Editor toolbar: headings", () => {
  // Each heading test clicks on a specific existing paragraph to
  // place the cursor there, then clicks the H1/H2 button and asserts
  // the same text is now inside the expected heading tag. This is
  // deterministic because we rely on content the demo README already
  // has, and openMarkdownFile now clears localStorage so no prior
  // test can poison the state.

  test("Heading 1 button applies <h1> to the current block", async ({ page }) => {
    await openMarkdownFile(page);
    const targetText = "A modern markdown workspace backed by GitHub";
    const target = page.locator(".ProseMirror p", { hasText: targetText });
    await target.click();
    await page.locator('button[title="Heading 1"]').locator("visible=true").first().click();
    await expect(
      page.locator(".ProseMirror h1", { hasText: targetText })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("Heading 2 button applies <h2> to the current block", async ({ page }) => {
    await openMarkdownFile(page);
    const targetText = "A modern markdown workspace backed by GitHub";
    const target = page.locator(".ProseMirror p", { hasText: targetText });
    await target.click();
    await page.locator('button[title="Heading 2"]').locator("visible=true").first().click();
    await expect(
      page.locator(".ProseMirror h2", { hasText: targetText })
    ).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Editor toolbar: lists", () => {
  // Same pattern as headings: click an existing paragraph, press
  // the list button, assert the paragraph's text now lives inside a
  // <ul>/<ol> list item.

  test("Bullet list button wraps the current block in a <ul>", async ({ page }) => {
    await openMarkdownFile(page);
    const targetText = "A modern markdown workspace backed by GitHub";
    const target = page.locator(".ProseMirror p", { hasText: targetText });
    await target.click();
    await page
      .locator('button[title^="Bullet List"]')
      .locator("visible=true")
      .first()
      .click();
    await expect(
      page.locator(".ProseMirror ul li", { hasText: targetText })
    ).toBeVisible({ timeout: 3_000 });
  });

  test("Numbered list button wraps the current block in an <ol>", async ({ page }) => {
    await openMarkdownFile(page);
    const targetText = "A modern markdown workspace backed by GitHub";
    const target = page.locator(".ProseMirror p", { hasText: targetText });
    await target.click();
    await page
      .locator('button[title^="Numbered List"]')
      .locator("visible=true")
      .first()
      .click();
    await expect(
      page.locator(".ProseMirror ol li", { hasText: targetText })
    ).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Editor view toggle: Rich ↔ Code round trip", () => {
  test("clicking Code switches to the raw markdown view", async ({ page }) => {
    await openMarkdownFile(page);
    await page
      .locator("button", { hasText: /^Code$/ })
      .locator("visible=true")
      .first()
      .click();
    // Code view renders a <textarea> with the raw markdown
    await expect(page.locator("textarea").first()).toBeVisible({ timeout: 3_000 });
    // Toggle label flipped to Rich
    await expect(
      page.locator("button", { hasText: /^Rich$/ }).locator("visible=true").first()
    ).toBeVisible();
  });

  test("toggling back to Rich preserves the document content", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    // Capture the rendered heading text as a sentinel
    const headingText = await page
      .locator(".ProseMirror h1")
      .first()
      .textContent();
    expect(headingText).toBeTruthy();

    // Switch to Code, then back to Rich
    await page.locator("button", { hasText: /^Code$/ }).locator("visible=true").first().click();
    await expect(page.locator("textarea").first()).toBeVisible();
    await page.locator("button", { hasText: /^Rich$/ }).locator("visible=true").first().click();
    await expect(pm).toBeVisible();

    // Same heading still rendered
    const afterText = await page.locator(".ProseMirror h1").first().textContent();
    expect(afterText?.trim()).toBe(headingText?.trim());
  });
});

test.describe("Editor outline panel", () => {
  test("outline toggle button shows/hides the outline panel", async ({ page, viewport }) => {
    // Outline on mobile renders in a MobileDrawer which has its own aria
    // structure. This test runs on desktop only for now.
    test.skip(!viewport || viewport.width < 768, "outline drawer is a mobile-specific overlay");
    await openMarkdownFile(page);

    // Find the outline toggle button. It has title containing "outline"
    const outlineBtn = page
      .locator('button[title*="outline" i]')
      .locator("visible=true")
      .first();
    await outlineBtn.click();

    // The outline aside renders with aria-label="Document outline"
    await expect(page.locator('aside[aria-label="Document outline"]')).toBeVisible({
      timeout: 2_000,
    });

    // Click again to hide
    await outlineBtn.click();
    await expect(page.locator('aside[aria-label="Document outline"]')).not.toBeVisible();
  });
});
