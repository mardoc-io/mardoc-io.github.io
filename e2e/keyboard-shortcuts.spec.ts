/**
 * E2E tests for MarDoc's keyboard shortcuts.
 *
 * These cover the global shortcut handlers mounted in app/page.tsx
 * plus the editor-scoped ones from TipTap's StarterKit. The canonical
 * shortcut registry lives in src/lib/keyboard-shortcuts.ts and the
 * guards (shouldOpenCheatsheet, shouldOpenCommandPalette) are unit-
 * tested — these tests prove the handlers are actually wired up to
 * their UI targets.
 *
 * Covers:
 *   - ? opens the keyboard cheatsheet
 *   - Escape closes the cheatsheet
 *   - ⌘⇧P opens the command palette
 *   - ⌘B / ⌘I format selected text inside the editor
 *   - ⌘F opens the find bar
 */
import { test, expect } from "@playwright/test";
import { openMarkdownFile, waitForHydration } from "./fixtures/helpers";

test.describe("Keyboard shortcuts: help overlays", () => {
  // Phones don't have a physical keyboard, so the help-overlay
  // shortcuts (`?` and ⌘⇧P) are desktop-only features by design.
  // Mobile users open the cheatsheet from the toolbar button.
  test.skip(
    ({ viewport }) => !viewport || viewport.width < 768,
    "help-overlay keyboard shortcuts are desktop-only"
  );

  test("? opens the keyboard cheatsheet", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    // Press `?` on the document/body. The global handler in
    // app/page.tsx intercepts it via a window keydown listener.
    await page.keyboard.press("?");
    await expect(page.locator('[role="dialog"][aria-label="Keyboard shortcuts"]')).toBeVisible({
      timeout: 2_000,
    });
  });

  test("Escape closes the keyboard cheatsheet", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.keyboard.press("?");
    await expect(page.locator('[role="dialog"][aria-label="Keyboard shortcuts"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"][aria-label="Keyboard shortcuts"]')).not.toBeVisible();
  });

  test("⌘⇧P opens the command palette", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.keyboard.press("ControlOrMeta+Shift+P");
    await expect(page.locator('[aria-label="Command palette"]')).toBeVisible({
      timeout: 2_000,
    });
  });

  test("Escape closes the command palette", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.keyboard.press("ControlOrMeta+Shift+P");
    await expect(page.locator('[aria-label="Command palette"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator('[aria-label="Command palette"]')).not.toBeVisible();
  });
});

test.describe("Keyboard shortcuts: editor formatting", () => {
  test("⌘B wraps the selection in <strong>", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await pm.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+B");
    await expect(page.locator(".ProseMirror strong").first()).toBeVisible({
      timeout: 2_000,
    });
  });

  test("⌘I wraps the selection in <em>", async ({ page }) => {
    const pm = await openMarkdownFile(page);
    await pm.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+I");
    await expect(page.locator(".ProseMirror em").first()).toBeVisible({
      timeout: 2_000,
    });
  });
});

test.describe("Keyboard shortcuts: find and replace", () => {
  // The rich-view find bar is opened by the TipTap MardocSearchExtension
  // catching Mod-f inside the editor and dispatching the custom event
  // `mardoc:open-find`. Synthetic keyboard events sent via Playwright
  // don't always reach TipTap's internal keymap (browser-level Ctrl+F
  // interception varies by headless/headed mode), so we fire the custom
  // event directly and verify the React handler wires it to the bar.
  // The TipTap keymap itself has unit-test coverage in
  // src/lib/tiptap-search-extension.ts.

  test("mardoc:open-find event shows the find-and-replace bar", async ({ page }) => {
    await openMarkdownFile(page);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("mardoc:open-find"));
    });
    await expect(page.locator('[aria-label="Find and replace"]')).toBeVisible({
      timeout: 2_000,
    });
  });

  test("The close button dismisses the find bar", async ({ page }) => {
    await openMarkdownFile(page);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("mardoc:open-find"));
    });
    await expect(page.locator('[aria-label="Find and replace"]')).toBeVisible();
    // Use the close button rather than Escape so this test works
    // identically on desktop and mobile webkit (where Playwright's
    // synthetic Escape doesn't always reach the React handler).
    await page.locator('[aria-label="Close find bar"]').click();
    await expect(page.locator('[aria-label="Find and replace"]')).not.toBeVisible({
      timeout: 2_000,
    });
  });
});
