/**
 * E2E tests asserting the Editor (markdown) and HtmlViewer (HTML)
 * toolbars share the same visual + behavioral contract.
 *
 * The user flagged three specific regressions:
 *   1. HTML pages didn't show word count / reading time
 *   2. HTML's view-mode toggle used `<>` + eye icons, while markdown
 *      uses `{}` + "Code" / "Rich" text labels
 *   3. Action button order in HTML was different from markdown
 *
 * All three get pinned here so any future divergence fails CI.
 */
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function waitForHydration(page: Page) {
  await page.waitForFunction(
    () => {
      const prsBtn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "PRs"
      );
      const hamburger = document.querySelector('button[aria-label="Open navigation"]');
      return !!prsBtn || !!hamburger;
    },
    { timeout: 15_000 }
  );
}

async function openSidebar(page: Page) {
  const hamburger = page.locator('button[aria-label="Open navigation"]');
  if (await hamburger.isVisible().catch(() => false)) {
    await hamburger.click();
    await page.waitForTimeout(350);
  }
}

async function clickInVisibleSidebar(page: Page, text: string) {
  await page
    .locator("button", { hasText: new RegExp(`^${text}$`) })
    .locator("visible=true")
    .first()
    .click();
}

async function clickVisibleText(page: Page, text: string | RegExp) {
  await page.getByText(text).locator("visible=true").first().click();
}

async function openMarkdownFile(page: Page) {
  await page.goto("/");
  await waitForHydration(page);
  await openSidebar(page);
  await clickInVisibleSidebar(page, "Files");
  await clickVisibleText(page, /README\.md/);
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 10_000 });
}

async function openHtmlFile(page: Page) {
  await page.goto("/");
  await waitForHydration(page);
  await openSidebar(page);
  await clickInVisibleSidebar(page, "Files");
  await clickVisibleText(page, /architecture-overview\.html/);
  await expect(page.locator("iframe")).toBeVisible({ timeout: 10_000 });
}

// ─── Word count / reading time ──────────────────────────────────
// Both Editor and HtmlViewer intentionally hide word count below
// the sm breakpoint (640px) to save mobile toolbar space. That's a
// product decision, not a bug, so these tests only run on desktop.

test.describe("Toolbar parity: word count + reading time", () => {
  test("markdown Editor displays words + minutes", async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width < 640, "word count is hidden below sm breakpoint");
    await openMarkdownFile(page);
    // Pattern: "N words · M min"
    await expect(page.locator("text=/\\d+ words · \\d+ min/")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("HtmlViewer displays words + minutes", async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width < 640, "word count is hidden below sm breakpoint");
    await openHtmlFile(page);
    await expect(page.locator("text=/\\d+ words · \\d+ min/")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("both toolbars compute the word count from real content", async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width < 640, "word count is hidden below sm breakpoint");
    // Check both surfaces show a non-zero word count. The demo
    // README.md and architecture-overview.html both have visible
    // prose, so "words" must be > 0.
    await openMarkdownFile(page);
    const mdText = await page
      .locator("text=/\\d+ words · \\d+ min/")
      .first()
      .textContent();
    const mdWords = parseInt((mdText || "").match(/(\d+) words/)?.[1] || "0", 10);
    expect(mdWords).toBeGreaterThan(0);

    await openHtmlFile(page);
    const htmlText = await page
      .locator("text=/\\d+ words · \\d+ min/")
      .first()
      .textContent();
    const htmlWords = parseInt((htmlText || "").match(/(\d+) words/)?.[1] || "0", 10);
    expect(htmlWords).toBeGreaterThan(0);
  });
});

// ─── Code / Rich view-mode toggle ───────────────────────────────

test.describe("Toolbar parity: Code/Rich view toggle", () => {
  test("markdown Editor's toggle uses 'Code' label by default", async ({ page }) => {
    await openMarkdownFile(page);
    // When in rich view, the button text is "Code"
    const toggle = page
      .locator("button", { hasText: /^Code$/ })
      .locator("visible=true")
      .first();
    await expect(toggle).toBeVisible({ timeout: 5_000 });
  });

  test("HtmlViewer's toggle uses the same 'Code' label by default", async ({ page }) => {
    await openHtmlFile(page);
    const toggle = page
      .locator("button", { hasText: /^Code$/ })
      .locator("visible=true")
      .first();
    await expect(toggle).toBeVisible({ timeout: 5_000 });
  });

  test("HtmlViewer toggle switches to 'Rich' label when in code view", async ({ page }) => {
    await openHtmlFile(page);
    const toggle = page
      .locator("button", { hasText: /^Code$/ })
      .locator("visible=true")
      .first();
    await toggle.click();
    await expect(
      page.locator("button", { hasText: /^Rich$/ }).locator("visible=true").first()
    ).toBeVisible({ timeout: 3_000 });
  });
});

// ─── Toolbar button ORDER ───────────────────────────────────────

test.describe("Toolbar parity: button order in HtmlViewer", () => {
  test("button order is: word count → Code toggle → fullscreen → comments", async ({ page }) => {
    await openHtmlFile(page);

    // Read the text content of each toolbar right-side element in order.
    // The toolbar has an outer flex container with text + buttons.
    const toolbarItems = await page.evaluate(() => {
      // The toolbar is the first flex container with word count + view toggle
      // Find the Code toggle button and walk up to its parent flex container.
      const codeBtn = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Code"
      );
      if (!codeBtn) return null;
      const toolbar = codeBtn.parentElement;
      if (!toolbar) return null;
      return Array.from(toolbar.children).map((el) => {
        const text = (el.textContent || "").trim();
        const title = el.getAttribute("title") || "";
        return text || title;
      });
    });

    expect(toolbarItems).not.toBeNull();
    if (!toolbarItems) return;

    // Word count comes first (non-empty text matching "N words · M min"),
    // then Code toggle, then Fullscreen, then Comments badge.
    const wordCountIdx = toolbarItems.findIndex((t) => /\d+ words/.test(t));
    const codeIdx = toolbarItems.findIndex((t) => /^Code$/.test(t));
    const fullscreenIdx = toolbarItems.findIndex((t) => /fullscreen/i.test(t));
    const commentsIdx = toolbarItems.findIndex((t) =>
      /^comments?$/i.test(t) || /Toggle comments/i.test(t)
    );

    expect(wordCountIdx).toBeGreaterThanOrEqual(0);
    expect(codeIdx).toBeGreaterThan(wordCountIdx);
    expect(fullscreenIdx).toBeGreaterThan(codeIdx);
    expect(commentsIdx).toBeGreaterThan(fullscreenIdx);
  });
});
