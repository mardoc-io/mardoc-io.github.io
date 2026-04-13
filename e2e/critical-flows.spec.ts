/**
 * Critical user flows — Playwright e2e smoke tests.
 *
 * Every test here guards a named user story. Breaking any of them is
 * a P0. Each test:
 *   1. Loads the app in demo mode (no GitHub auth needed)
 *   2. Navigates to the fixture content
 *   3. Exercises the user-facing action
 *   4. Asserts observable state
 *
 * These complement the unit tests in src/__tests__/. If a bug only
 * shows up when the real DiffViewer + real Sidebar + real
 * CommentPanel render together in a real browser, this is where it
 * gets caught.
 */
import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Wait for the app to hydrate. On mobile the sidebar is inside a
 * drawer so we wait for the hamburger button; on desktop we wait
 * for the inline PRs tab. Either one proves React has committed.
 */
async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      // Desktop: sidebar "PRs" button is in the DOM
      const prsBtn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "PRs"
      );
      // Mobile: hamburger menu button is in the DOM
      const hamburger = document.querySelector('button[aria-label="Open navigation"]');
      return !!prsBtn || !!hamburger;
    },
    { timeout: 15_000 }
  );
}

/** Open the sidebar drawer on mobile. No-op on desktop. */
async function openSidebar(page: Page) {
  const hamburger = page.locator('button[aria-label="Open navigation"]');
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    // Wait for the drawer to fully slide in
    await page.waitForTimeout(350);
  }
}

/**
 * Click a button inside the visible sidebar (either the inline
 * desktop sidebar or the mobile drawer). The `hidden md:flex`
 * desktop wrapper leaves a duplicate Sidebar in the DOM on mobile,
 * so we need to scope to the visible one.
 */
async function clickInVisibleSidebar(page: Page, text: string) {
  // Use :visible filter — Playwright's locator(":visible") selects
  // elements that are actually rendered (not display:none).
  await page
    .locator("button", { hasText: new RegExp(`^${text}$`) })
    .locator("visible=true")
    .first()
    .click();
}

/** Open the PR list sidebar. */
async function openPRsTab(page: Page) {
  await openSidebar(page);
  await clickInVisibleSidebar(page, "PRs");
}

/** Open the Files tab. */
async function openFilesTab(page: Page) {
  await openSidebar(page);
  await clickInVisibleSidebar(page, "Files");
}

/**
 * Click a file or PR item by text in the currently-visible sidebar.
 * Scopes to :visible elements so the hidden desktop sidebar doesn't
 * shadow the mobile drawer's copy.
 */
async function clickVisibleText(page: Page, text: string | RegExp) {
  await page
    .getByText(text)
    .locator("visible=true")
    .first()
    .click();
}

/**
 * Select text inside an iframe programmatically and fire a mouseup
 * event that the iframe script listens for. Returns the text that
 * was selected so the caller can assert on it.
 */
async function selectTextInsideIframe(
  page: Page,
  iframeSelector: string,
  targetTextSelector = "p",
  maxLength = 20
): Promise<string> {
  const iframe = page.frameLocator(iframeSelector);
  const text = await iframe.locator(targetTextSelector).first().evaluate(
    (el, max) => {
      const node = el.firstChild;
      if (!node || node.nodeType !== 3) return "";
      const fullText = node.textContent || "";
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(max, fullText.length));
      const sel = window.getSelection();
      if (!sel) return "";
      sel.removeAllRanges();
      sel.addRange(range);
      // Fire mouseup so the selection script's handler runs
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return sel.toString();
    },
    maxLength
  );
  return text;
}

// ─── Flow 1: HTML commenting in PR review (DiffViewer) ──────────────

test.describe("Critical flow: HTML commenting inside a PR", () => {
  test("select text in the HTML iframe and add an inline comment", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);

    // Open the PR list and click the HTML architecture PR (demo PR #37)
    await openPRsTab(page);
    await clickVisibleText(page, /architecture overview/i);

    // Wait for the DiffViewer iframe
    const iframe = await page.waitForSelector("iframe", { timeout: 10_000 });
    expect(iframe).toBeTruthy();

    // Wait for the iframe to be ready and select text inside it
    const selectedText = await selectTextInsideIframe(page, "iframe", "p", 18);
    expect(selectedText.length).toBeGreaterThan(3);

    // The pending-comment input should appear
    await expect(page.locator("text=Commenting on selected text:")).toBeVisible({
      timeout: 5_000,
    });

    // Type a comment
    const input = page.getByPlaceholder("Write your comment...");
    await input.fill("e2e test comment on HTML");

    // Click the "Comment" button (NOT the toolbar "Comments" toggle)
    // Use a locator that matches the exact text "Comment" inside the pending bar.
    const submitBtn = page
      .locator('button', { hasText: /^Comment$/ })
      .last();
    await submitBtn.click();

    // Comment should appear in the side panel
    await expect(page.locator("text=e2e test comment on HTML")).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ─── Flow 2: HTML commenting when viewing a file OUTSIDE a PR ───────
// This test exists BECAUSE this flow was previously broken. Viewing
// an HTML file from the file tree routed to HtmlViewer, which had
// no commenting support. Users could select text but nothing happened.

test.describe("Critical flow: HTML commenting outside a PR (HtmlViewer)", () => {
  test("select text in a standalone HTML file and see a comment affordance", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);

    // Browse to an HTML file in the repo's file tree. Demo mode
    // includes docs/architecture-overview.html. The docs folder
    // auto-expands on first render, so the file should be visible
    // without any expand/collapse dance.
    await openFilesTab(page);
    await clickVisibleText(page, /architecture-overview.html/);

    // Wait for the HtmlViewer iframe
    const iframe = await page.waitForSelector("iframe", { timeout: 10_000 });
    expect(iframe).toBeTruthy();

    // Select text inside the iframe
    const selectedText = await selectTextInsideIframe(page, "iframe", "p", 18);
    expect(selectedText.length).toBeGreaterThan(3);

    // The pending-comment bar should appear — this is what was
    // missing from HtmlViewer before the fix.
    await expect(page.locator("text=Commenting on selected text:")).toBeVisible({
      timeout: 5_000,
    });
  });
});

// ─── Flow 3: Markdown commenting in Editor (baseline) ───────────────

test.describe("Critical flow: markdown file commenting", () => {
  test("the editor loads a markdown file from the tree", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);

    await openFilesTab(page);
    // Demo mode has README.md at the root
    await clickVisibleText(page, /README\.md/);

    // The TipTap editor renders a ProseMirror element
    await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 5_000 });
  });
});
