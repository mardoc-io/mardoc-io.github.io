import { test, expect } from "@playwright/test";
import { openPullRequest } from "./fixtures/helpers";

// Split view is desktop-only (hidden md:block)
test.describe("Split view: synchronized scrolling and diff colors", () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!!isMobile, "split view is desktop-only");
    await openPullRequest(page, /getting started guide/i);
    await page.locator("button", { hasText: /^Side by Side$/ }).click();
    await page.waitForTimeout(500);
  });

  test("renders a single scrollable container (no independent pane scrollbars)", async ({ page }) => {
    const diffGrid = page.locator(".grid.grid-cols-2").last();
    await expect(diffGrid).toBeVisible({ timeout: 5_000 });

    // The grid should NOT have independently-scrollable children
    const independentPanels = diffGrid.locator(":scope > [class*='overflow-y-auto']");
    await expect(independentPanels).toHaveCount(0);
  });

  test("shows sticky base/head headers", async ({ page }) => {
    const baseHeader = page.locator("text=base:").first();
    const headHeader = page.locator("text=head:").first();
    await expect(baseHeader).toBeVisible({ timeout: 5_000 });
    await expect(headHeader).toBeVisible();
  });

  test("highlights added blocks with a visible background color on the right", async ({ page }) => {
    // The "Prerequisites" section is added in head — its grid cell should have
    // a non-transparent background (the diff-add green).
    const prerequisitesText = page.locator(".grid.grid-cols-2 >> text=Prerequisites").first();
    await expect(prerequisitesText).toBeVisible({ timeout: 5_000 });

    // Walk up from the text to the grid cell and check its background
    const bgColor = await prerequisitesText.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      while (node) {
        const bg = window.getComputedStyle(node).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        node = node.parentElement;
      }
      return "transparent";
    });
    expect(bgColor).not.toBe("transparent");
  });

  test("both columns scroll together via a single scroll action", async ({ page }) => {
    // The split view container is the overflow-y-auto ancestor of the grid
    const splitContainer = page.locator(".grid.grid-cols-2").last().locator("..");
    // Walk up to find the scrollable container
    const scrollable = page.locator(".grid.grid-cols-2").last().evaluate((grid) => {
      let el: HTMLElement | null = grid.parentElement;
      while (el) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === "auto" || style.overflowY === "scroll") return true;
        el = el.parentElement;
      }
      return false;
    });
    expect(await scrollable).toBe(true);

    // Find the scrollable ancestor and scroll it
    const scrollResult = await page.locator(".grid.grid-cols-2").last().evaluate((grid) => {
      let el: HTMLElement | null = grid.parentElement;
      while (el) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          const before = el.scrollTop;
          el.scrollBy(0, 300);
          return { before, after: el.scrollTop };
        }
        el = el.parentElement;
      }
      return null;
    });

    expect(scrollResult).not.toBeNull();
    expect(scrollResult!.after).toBeGreaterThan(scrollResult!.before);
  });

  test("diff rows are vertically aligned (even number of grid cells)", async ({ page }) => {
    const diffGrid = page.locator(".grid.grid-cols-2").last();
    await expect(diffGrid).toBeVisible({ timeout: 5_000 });

    const cellCount = await diffGrid.locator(":scope > *").count();
    expect(cellCount).toBeGreaterThan(0);
    expect(cellCount % 2).toBe(0);
  });
});
